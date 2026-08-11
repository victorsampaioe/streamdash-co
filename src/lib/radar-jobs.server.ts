// Server-only: fila de sincronização do Radar IPTV (Filmes VOD + Séries).
//
// Arquitetura:
//  - O painel apenas CRIA um job (iptv_sync_jobs + iptv_sync_job_items).
//  - O processamento roda no Core AWS / cron, em lotes pequenos e retomável:
//    cada execução pega alguns servidores pendentes, processa e devolve.
//  - Nada depende do navegador permanecer aberto.
//  - A sincronização é INCREMENTAL: comparamos com o catálogo já salvo.
//  - TMDB é uma segunda etapa (enriquecimento). Conteúdo sem TMDB continua
//    salvo com tmdb_status = 'pending'.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { titleKey } from "./iptv-catalog.server";

export const RADAR_BATCH_SIZE = 5;
const CHUNK = 500;

export type RadarEntry = { id: string; name: string; category: string | null };

async function chunked<T>(rows: T[], fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

/* ------------------------------------------------------------------ */
/* Servidores elegíveis                                                */
/* ------------------------------------------------------------------ */

export async function eligibleRadarServerIds(): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin.rpc("run_radar_batch_sync");
    if (error) {
      console.error("[radar-job] Erro RPC run_radar_batch_sync:", error);
      throw error;
    }
    return ((data as any)?.server_ids ?? []) as string[];
  } catch (error) {
    console.error("[radar-job] Exceção em eligibleRadarServerIds:", error);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Criação de job                                                      */
/* ------------------------------------------------------------------ */

export async function createRadarJob(
  serverIds: string[],
  kind: "manual" | "auto" = "manual",
  createdBy: string | null = null,
): Promise<{ job_id: string; total_servers: number }> {
  const ids = Array.from(new Set(serverIds.filter(Boolean)));
  const { data: job, error } = await supabaseAdmin
    .from("iptv_sync_jobs")
    .insert({ kind, created_by: createdBy, total_servers: ids.length, status: "queued" } as never)
    .select("id")
    .single();
  if (error || !job) throw new Error(error?.message ?? "Falha ao criar job do Radar");

  await chunked(ids, async (part) => {
    await supabaseAdmin
      .from("iptv_sync_job_items")
      .insert(part.map((sid) => ({ job_id: (job as any).id, server_id: sid })) as never);
  });

  console.log(`[radar-job] Job ${(job as any).id} criado (${kind}) com ${ids.length} servidores.`);
  return { job_id: (job as any).id as string, total_servers: ids.length };
}

/** Dispara o processamento no Core AWS; se o Core não responder JSON, processa local. */
export async function kickRadarJob(): Promise<"core" | "local"> {
  const { useCore, coreJsonPost } = await import("./core-api.server");
  if (useCore()) {
    try {
      await coreJsonPost("/api/public/cron/radar", 15_000);
      return "core";
    } catch (e) {
      console.warn("[radar-job] Core indisponível, processando local:", (e as Error).message);
    }
  }
  void runRadarJobStep().catch((e) => console.error("[radar-job] erro no step local:", e));
  return "local";
}

/* ------------------------------------------------------------------ */
/* Recuperação automática de trabalho travado                          */
/* ------------------------------------------------------------------ */

const ITEM_STUCK_MS = 15 * 60_000;

/**
 * Devolve para a fila itens que ficaram presos em "running" (worker morto,
 * timeout do Core, deploy no meio do lote) e conclui jobs cujos itens
 * terminaram mas que ficaram marcados como em andamento.
 */
export async function reclaimStuckRadarWork() {
  const cutoff = new Date(Date.now() - ITEM_STUCK_MS).toISOString();

  const { data: stuck } = await supabaseAdmin
    .from("iptv_sync_job_items")
    .select("id")
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .limit(200);

  const stuckIds = ((stuck ?? []) as { id: string }[]).map((r) => r.id);
  if (stuckIds.length) {
    await supabaseAdmin
      .from("iptv_sync_job_items")
      .update({ status: "pending", started_at: null } as never)
      .in("id", stuckIds);
    console.warn(`[radar-job] ${stuckIds.length} itens presos devolvidos para a fila.`);
  }

  // Jobs abertos sem itens pendentes → concluídos.
  const { data: openJobs } = await supabaseAdmin
    .from("iptv_sync_jobs")
    .select("id")
    .in("status", ["queued", "running"]);

  let closed = 0;
  for (const j of (openJobs ?? []) as { id: string }[]) {
    const { count } = await supabaseAdmin
      .from("iptv_sync_job_items")
      .select("id", { count: "exact", head: true })
      .eq("job_id", j.id)
      .in("status", ["pending", "running"]);
    if (!count) {
      await supabaseAdmin
        .from("iptv_sync_jobs")
        .update({ status: "completed", finished_at: new Date().toISOString() } as never)
        .eq("id", j.id);
      closed++;
    }
  }

  return { requeued: stuckIds.length, jobs_closed: closed };
}


/* ------------------------------------------------------------------ */
/* Sincronização incremental de um servidor (somente VOD + séries)     */
/* ------------------------------------------------------------------ */

export async function syncServerVodCatalog(
  serverId: string,
  catalog: { vod: RadarEntry[]; series: RadarEntry[] },
): Promise<{ movies: number; series: number; new_titles: number; removed: number }> {
  const nowIso = new Date().toISOString();

  const dedupe = (list: RadarEntry[]) => {
    const map = new Map<string, RadarEntry>();
    for (const it of list) {
      const id = String(it.id ?? "").trim();
      const name = String(it.name ?? "").trim();
      if (!id || !name) continue;
      map.set(id, { id, name, category: it.category ?? null });
    }
    return [...map.values()];
  };

  const clean = { vod: dedupe(catalog.vod), series: dedupe(catalog.series) };

  // Estado atual (apenas kinds do Radar — canais live não são tocados aqui)
  const known = new Map<string, { name: string; category: string | null }>();
  {
    let from = 0;
    for (;;) {
      const { data } = await supabaseAdmin
        .from("iptv_catalog_items")
        .select("kind, external_id, name, category")
        .eq("server_id", serverId)
        .in("kind", ["vod", "series"])
        .is("removed_at", null)
        .range(from, from + 999);
      const rows = (data ?? []) as { kind: string; external_id: string; name: string; category: string | null }[];
      for (const r of rows) known.set(`${r.kind}:${r.external_id}`, { name: r.name, category: r.category ?? null });
      if (rows.length < 1000) break;
      from += 1000;
      if (from > 400_000) break;
    }
  }

  const upserts: Record<string, unknown>[] = [];
  const currentKeys = new Set<string>();

  for (const kind of ["vod", "series"] as const) {
    for (const it of clean[kind]) {
      const key = `${kind}:${it.id}`;
      currentKeys.add(key);
      const prev = known.get(key);
      if (!prev || prev.name !== it.name || prev.category !== it.category) {
        upserts.push({
          server_id: serverId,
          kind,
          external_id: it.id,
          name: it.name,
          title_key: titleKey(it.name),
          category: it.category,
          last_seen_at: nowIso,
          removed_at: null,
          ...(prev ? {} : { first_seen_at: nowIso }),
        });
      }
    }
  }

  await chunked(upserts, async (part) => {
    const { error } = await supabaseAdmin
      .from("iptv_catalog_items")
      .upsert(part as never, { onConflict: "server_id,kind,external_id" });
    if (error) throw new Error(`catalog_items: ${error.message}`);
  });

  // Ausentes: marcados como removidos (não apagamos o catálogo inteiro).
  const missing = [...known.keys()].filter((k) => !currentKeys.has(k));
  await chunked(missing, async (part) => {
    await supabaseAdmin
      .from("iptv_catalog_items")
      .update({ removed_at: nowIso } as never)
      .eq("server_id", serverId)
      .in("external_id", part.map((k) => k.split(":").slice(1).join(":")));
  });

  // ---- Radar Global (independe do TMDB) ----
  let newTitles = 0;
  for (const kind of ["vod", "series"] as const) {
    const mediaType = kind === "series" ? "tv" : "movie";
    const byKey = new Map<string, RadarEntry>();
    for (const it of clean[kind]) {
      const tk = titleKey(it.name);
      if (tk) byKey.set(tk, it);
    }
    const keys = [...byKey.keys()];

    for (let i = 0; i < keys.length; i += CHUNK) {
      const part = keys.slice(i, i + CHUNK);

      const { data: existing } = await supabaseAdmin
        .from("iptv_global_catalog")
        .select("id, title_key")
        .eq("media_type", mediaType)
        .in("title_key", part);
      const existingMap = new Map((existing ?? []).map((r: any) => [r.title_key as string, r.id as string]));

      const toInsert = part
        .filter((k) => !existingMap.has(k))
        .map((k) => ({
          title_key: k,
          media_type: mediaType,
          normalized_name: byKey.get(k)!.name,
          first_server_id: serverId,
          first_detected_at: nowIso,
          last_detected_at: nowIso,
          tmdb_status: "pending",
        }));

      if (toInsert.length) {
        const { data: inserted } = await supabaseAdmin
          .from("iptv_global_catalog")
          .upsert(toInsert as never, { onConflict: "title_key,media_type", ignoreDuplicates: true })
          .select("id, title_key");
        for (const r of (inserted ?? []) as any[]) existingMap.set(r.title_key, r.id);
        newTitles += (inserted ?? []).length;
      }

      // Títulos que ainda não têm id (corrida entre servidores em paralelo)
      const stillMissing = part.filter((k) => !existingMap.has(k));
      if (stillMissing.length) {
        const { data: again } = await supabaseAdmin
          .from("iptv_global_catalog")
          .select("id, title_key")
          .eq("media_type", mediaType)
          .in("title_key", stillMissing);
        for (const r of (again ?? []) as any[]) existingMap.set(r.title_key, r.id);
      }

      const ids = [...existingMap.values()];
      if (ids.length) {
        await supabaseAdmin
          .from("iptv_global_catalog")
          .update({ last_detected_at: nowIso } as never)
          .in("id", ids);
      }

      const matches = part
        .filter((k) => existingMap.has(k))
        .map((k) => ({
          catalog_id: existingMap.get(k)!,
          server_id: serverId,
          external_id: byKey.get(k)!.id,
          raw_name: byKey.get(k)!.name,
          detected_at: nowIso,
        }));
      if (matches.length) {
        // Upsert para garantir que atualizamos a última detecção e mantemos o vínculo catálogo <-> servidor
        await supabaseAdmin
          .from("iptv_catalog_matches")
          .upsert(matches as never, { onConflict: "catalog_id,server_id" });
      }
    }
  }

  await supabaseAdmin
    .from("servers")
    .update({ catalog_synced_at: nowIso } as never)
    .eq("id", serverId);

  return { movies: clean.vod.length, series: clean.series.length, new_titles: newTitles, removed: missing.length };
}

/* ------------------------------------------------------------------ */
/* Processamento de um servidor do job                                 */
/* ------------------------------------------------------------------ */

async function processServer(serverId: string) {
  const { data: srv } = await supabaseAdmin
    .from("servers")
    .select("id, host, owner_id, name")
    .eq("id", serverId)
    .maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");

  const { getActiveOwnerIds } = await import("./service-status.server");
  const active = await getActiveOwnerIds([(srv as any).owner_id]);
  if (!active.has((srv as any).owner_id)) throw new Error("Conta expirada — monitoramento pausado");

  const { getIptvCredentials } = await import("./iptv-credentials.server");
  const cred = await getIptvCredentials(serverId);
  if (!cred.username || !cred.password) throw new Error("Credenciais Xtream ausentes");

  console.log(`[radar-job] [${serverId}] Etapa: login Xtream + catálogo VOD/Séries`);
  const { probeXtream } = await import("./iptv.server");
  const x = await probeXtream((srv as any).host, cred.username, cred.password, { catalogMode: "vod" });
  if (!x.login_ok) throw new Error(x.error ?? "Login Xtream recusado");

  console.log(
    `[radar-job] [${serverId}] Etapa: salvar catálogo (filmes=${x.catalog.vod.length}, séries=${x.catalog.series.length})`,
  );
  const res = await syncServerVodCatalog(serverId, {
    vod: x.catalog.vod as RadarEntry[],
    series: x.catalog.series as RadarEntry[],
  });

  await supabaseAdmin
    .from("servers")
    .update({ last_iptv_sync_at: new Date().toISOString() } as never)
    .eq("id", serverId);

  return res;
}

/* ------------------------------------------------------------------ */
/* Executor de um passo do job (retomável)                             */
/* ------------------------------------------------------------------ */

export async function runRadarJobStep(opts: { batchSize?: number } = {}) {
  const batchSize = opts.batchSize ?? RADAR_BATCH_SIZE;

  const { data: job } = await supabaseAdmin
    .from("iptv_sync_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) return { job_id: null, processed: 0, idle: true };
  const jobId = (job as any).id as string;

  if ((job as any).status === "queued") {
    await supabaseAdmin
      .from("iptv_sync_jobs")
      .update({ status: "running", started_at: new Date().toISOString() } as never)
      .eq("id", jobId);
  }

  const { data: pending } = await supabaseAdmin
    .from("iptv_sync_job_items")
    .select("id, server_id")
    .eq("job_id", jobId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(batchSize);

  const items = (pending ?? []) as { id: string; server_id: string }[];

  if (!items.length) {
    const { count: leftover } = await supabaseAdmin
      .from("iptv_sync_job_items")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .in("status", ["pending", "running"]);
    if (!leftover) {
      await supabaseAdmin
        .from("iptv_sync_jobs")
        .update({ status: "completed", finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    }
    return { job_id: jobId, processed: 0, completed: true };
  }

  await supabaseAdmin
    .from("iptv_sync_job_items")
    .update({ status: "running", started_at: new Date().toISOString() } as never)
    .in("id", items.map((i) => i.id));

  let success = 0;
  let failed = 0;
  let movies = 0;
  let series = 0;
  let lastError: string | null = null;

  await Promise.all(
    items.map(async (item) => {
      try {
        const res = await processServer(item.server_id);
        success++;
        movies += res.movies;
        series += res.series;
        await supabaseAdmin
          .from("iptv_sync_job_items")
          .update({
            status: "done",
            movies: res.movies,
            series: res.series,
            error: null,
            finished_at: new Date().toISOString(),
          } as never)
          .eq("id", item.id);
        console.log(
          `[radar-job] [${item.server_id}] ✅ ${res.movies} filmes, ${res.series} séries, ${res.new_titles} novos títulos`,
        );
      } catch (e: any) {
        failed++;
        lastError = `${item.server_id}: ${e?.message ?? "erro"}`.slice(0, 400);
        console.error(`[radar-job] [${item.server_id}] ❌ ${e?.message}`);
        await supabaseAdmin
          .from("iptv_sync_job_items")
          .update({
            status: "failed",
            error: String(e?.message ?? "erro").slice(0, 400),
            finished_at: new Date().toISOString(),
          } as never)
          .eq("id", item.id);
      }
    }),
  );

  const { data: cur } = await supabaseAdmin.from("iptv_sync_jobs").select("*").eq("id", jobId).maybeSingle();
  const j = (cur ?? {}) as any;
  await supabaseAdmin
    .from("iptv_sync_jobs")
    .update({
      processed: (j.processed ?? 0) + items.length,
      success_count: (j.success_count ?? 0) + success,
      failed_count: (j.failed_count ?? 0) + failed,
      movies_found: (j.movies_found ?? 0) + movies,
      series_found: (j.series_found ?? 0) + series,
      ...(lastError ? { last_error: lastError } : {}),
    } as never)
    .eq("id", jobId);

  const { count: remaining } = await supabaseAdmin
    .from("iptv_sync_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["pending", "running"]);

  if (!remaining) {
    await supabaseAdmin
      .from("iptv_sync_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString() } as never)
      .eq("id", jobId);
  }

  return { job_id: jobId, processed: items.length, success, failed, movies, series, remaining: remaining ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Etapa 2 — enriquecimento TMDB (não bloqueia o catálogo)             */
/* ------------------------------------------------------------------ */

function cleanForTmdb(name: string): string {
  return name
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(4k|uhd|fhd|hd|sd|hevc|h265|x265|h264|web-?dl|hdr|bluray|hdtv|webrip|dublado|legendado|dual|leg|dub|multi|nacional|l|d)\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[|_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function enrichTmdbPending(limit = 40) {
  if (!process.env["TMDB_API_KEY"]) return { checked: 0, found: 0, skipped: "TMDB_API_KEY ausente" };

  const { data } = await supabaseAdmin
    .from("iptv_global_catalog")
    .select("id, normalized_name, media_type")
    .eq("tmdb_status", "pending")
    .order("last_detected_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as { id: string; normalized_name: string; media_type: string }[];
  if (!rows.length) return { checked: 0, found: 0 };

  const { searchTmdb } = await import("./tmdb.server");
  let found = 0;
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    const query = cleanForTmdb(row.normalized_name);
    let match: any = null;
    try {
      if (query.length >= 2) {
        const results = await searchTmdb(query);
        match =
          results.find((r) => r.media_type === (row.media_type === "tv" ? "tv" : "movie")) ?? results[0] ?? null;
      }
    } catch (e: any) {
      console.warn(`[radar-tmdb] falha na busca "${query}": ${e?.message}`);
      continue;
    }

    if (match) {
      found++;
      await supabaseAdmin
        .from("iptv_global_catalog")
        .update({
          tmdb_id: match.tmdb_id,
          poster_path: match.poster_path,
          vote_average: match.vote_average ?? null,
          release_year: match.release_date ? Number(match.release_date.slice(0, 4)) || null : null,
          normalized_name: match.title || row.normalized_name,
          tmdb_status: "found",
          tmdb_checked_at: nowIso,
        } as never)
        .eq("id", row.id);
    } else {
      await supabaseAdmin
        .from("iptv_global_catalog")
        .update({ tmdb_status: "not_found", tmdb_checked_at: nowIso } as never)
        .eq("id", row.id);
    }

    await new Promise((r) => setTimeout(r, 120));
  }

  return { checked: rows.length, found };
}

/* ------------------------------------------------------------------ */
/* Sincronização automática                                            */
/* ------------------------------------------------------------------ */

const AUTO_INTERVAL_MS = 12 * 3600_000;

export async function ensureAutoRadarJob() {
  const { count: activeJobs } = await supabaseAdmin
    .from("iptv_sync_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);
  if (activeJobs) return { created: false, reason: "job em andamento" };

  const { data: lastAuto } = await supabaseAdmin
    .from("iptv_sync_jobs")
    .select("created_at")
    .eq("kind", "auto")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAuto && Date.now() - new Date((lastAuto as any).created_at).getTime() < AUTO_INTERVAL_MS) {
    return { created: false, reason: "intervalo automático não atingido" };
  }

  const ids = await eligibleRadarServerIds();
  if (!ids.length) return { created: false, reason: "nenhum servidor elegível" };
  const job = await createRadarJob(ids, "auto", null);
  return { created: true, ...job };
}

/* ------------------------------------------------------------------ */
/* Progresso                                                           */
/* ------------------------------------------------------------------ */

export async function getRadarJobProgress() {
  const { data: job, error } = await supabaseAdmin
    .from("iptv_sync_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[radar-job] Erro ao buscar progresso do job:", error);
  }

  const [{ count: tmdbFound }, { count: tmdbPending }] = await Promise.all([
    supabaseAdmin.from("iptv_global_catalog").select("id", { count: "exact", head: true }).eq("tmdb_status", "found"),
    supabaseAdmin.from("iptv_global_catalog").select("id", { count: "exact", head: true }).eq("tmdb_status", "pending"),
  ]);

  const [{ count: movies }, { count: series }] = await Promise.all([
    supabaseAdmin.from("iptv_global_catalog").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
    supabaseAdmin.from("iptv_global_catalog").select("id", { count: "exact", head: true }).eq("media_type", "tv"),
  ]);

  return {
    job: job as any,
    catalog: {
      movies: movies ?? 0,
      series: series ?? 0,
      tmdb_found: tmdbFound ?? 0,
      tmdb_pending: tmdbPending ?? 0,
    },
  };
}
