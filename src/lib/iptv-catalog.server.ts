// Server-only: Inteligência de Conteúdo IPTV.
// Compara o catálogo atual (metadados apenas) com o último estado conhecido,
// registra adições/remoções, histórico diário e assinatura (hash) do catálogo.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CatalogKind = "live" | "vod" | "series";

export type CatalogEntry = { id: string; name: string; category?: string | null };
export type CatalogInput = Record<CatalogKind, CatalogEntry[]>;

export type CatalogDiff = {
  skipped: boolean;
  reason?: string;
  hash: string;
  sync_ms: number;
  added: Record<CatalogKind, number>;
  removed: number;
  totals: Record<CatalogKind, number>;
};

const MAX_ITEMS_PER_KIND = 40_000;
const CHUNK = 500;

/** Normaliza o título para comparar o mesmo conteúdo entre servidores diferentes. */
export function titleKey(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // Remove pontuação e caracteres especiais
    .replace(/\b(4k|fhd|hd|sd|h265|hevc|dublado|legendado|leg|dub|l|d|dual|audio|hdtv|webrip|bluray|x264|x265)\b/g, " ") // Remove tags comuns
    .replace(/\(\d{4}\)|\b\d{4}\b/g, " ") // Remove ano entre parênteses ou solto
    .replace(/\b(s\d{1,2}e\d{1,2}|s\d{1,2}|temporada\s?\d{1,2}|t\d{1,2}|ep\d{1,2})\b/g, " ") // Remove temporada/episódio
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Hash rápido e estável (FNV-1a) da lista completa — evita reprocessar catálogo idêntico. */
function hashCatalog(input: CatalogInput): string {
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const kind of ["live", "vod", "series"] as CatalogKind[]) {
    feed(kind);
    for (const it of input[kind]) feed(`${it.id}:${it.name}|`);
  }
  return (h >>> 0).toString(16);
}

async function chunked<T>(rows: T[], fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

/**
 * Sincroniza o catálogo de um servidor.
 * Só armazena metadados (id, nome, categoria) — nunca conteúdo de vídeo.
 */
export async function syncCatalog(
  serverId: string,
  input: CatalogInput,
  opts: { force?: boolean } = {},
): Promise<CatalogDiff> {
  const started = Date.now();
  const kinds: CatalogKind[] = ["live", "vod", "series"];

  const clean: CatalogInput = { live: [], vod: [], series: [] };
  for (const kind of kinds) {
    const seen = new Set<string>();
    for (const raw of input[kind] ?? []) {
      const id = String(raw.id ?? "").trim();
      const name = String(raw.name ?? "").trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      clean[kind].push({ id, name, category: raw.category ?? null });
      if (clean[kind].length >= MAX_ITEMS_PER_KIND) break;
    }
  }

  const totals = { live: clean.live.length, vod: clean.vod.length, series: clean.series.length };
  const hash = hashCatalog(clean);

  const { data: srv } = await supabaseAdmin
    .from("servers")
    .select("catalog_hash")
    .eq("id", serverId)
    .maybeSingle();

  if (!opts.force && srv && (srv as { catalog_hash: string | null }).catalog_hash === hash) {
    await supabaseAdmin
      .from("servers")
      .update({ catalog_synced_at: new Date().toISOString() } as never)
      .eq("id", serverId);
    return {
      skipped: true,
      reason: "catálogo idêntico (hash)",
      hash,
      sync_ms: Date.now() - started,
      added: { live: 0, vod: 0, series: 0 },
      removed: 0,
      totals,
    };
  }

  // Estado atual no banco (apenas itens ativos)
  const known = new Map<string, { name: string; category: string | null }>();
  {
    let from = 0;
    for (;;) {
      const { data } = await supabaseAdmin
        .from("iptv_catalog_items")
        .select("kind, external_id, name, category")
        .eq("server_id", serverId)
        .is("removed_at", null)
        .range(from, from + 999);
      const rows = (data ?? []) as { kind: string; external_id: string; name: string; category: string | null }[];
      for (const r of rows) known.set(`${r.kind}:${r.external_id}`, { name: r.name, category: r.category ?? null });
      if (rows.length < 1000) break;
      from += 1000;
      if (from > 200_000) break;
    }
  }

  const nowIso = new Date().toISOString();
  const firstRun = known.size === 0;
  const upserts: Record<string, unknown>[] = [];
  const changes: Record<string, unknown>[] = [];
  const added = { live: 0, vod: 0, series: 0 } as Record<CatalogKind, number>;
  const currentKeys = new Set<string>();

  for (const kind of kinds) {
    for (const it of clean[kind]) {
      const key = `${kind}:${it.id}`;
      currentKeys.add(key);
      const prev = known.get(key);
      const category = it.category ?? null;
      // Só grava quando o item é novo ou mudou de fato: evita reescrever
      // centenas de milhares de linhas idênticas a cada sincronização.
      const changed = !prev || prev.name !== it.name || prev.category !== category;
      if (changed) {
        upserts.push({
          server_id: serverId,
          kind,
          external_id: it.id,
          name: it.name,
          title_key: titleKey(it.name),
          category,
          last_seen_at: nowIso,
          removed_at: null,
          ...(prev ? {} : { first_seen_at: nowIso }),
        });
      }

      if (!prev) {
        added[kind]++;
        // No primeiro mapeamento tudo é "novo": não gera ruído de novidades.
        if (!firstRun) {
          changes.push({
            server_id: serverId,
            kind,
            action: "added",
            external_id: it.id,
            name: it.name,
            category: it.category ?? null,
            detected_at: nowIso,
          });
        }
      }
    }
  }

  const removedKeys: { kind: string; id: string; name: string }[] = [];
  for (const [key, val] of known) {
    if (currentKeys.has(key)) continue;
    const [kind, ...rest] = key.split(":");
    removedKeys.push({ kind: kind!, id: rest.join(":"), name: val.name });
  }

  await chunked(upserts, async (part) => {
    await supabaseAdmin
      .from("iptv_catalog_items")
      .upsert(part as never, { onConflict: "server_id,kind,external_id" });
  });

  if (removedKeys.length) {
    await chunked(removedKeys, async (part) => {
      await supabaseAdmin
        .from("iptv_catalog_items")
        .update({ removed_at: nowIso } as never)
        .eq("server_id", serverId)
        .in("external_id", part.map((r) => r.id));
    });
    for (const r of removedKeys) {
      changes.push({
        server_id: serverId,
        kind: r.kind,
        action: "removed",
        external_id: r.id,
        name: r.name,
        detected_at: nowIso,
      });
    }
  }

  if (changes.length) {
    await chunked(changes, async (part) => {
      await supabaseAdmin.from("iptv_catalog_changes").insert(part as never);
    });
  }

  const syncMs = Date.now() - started;
  const day = nowIso.slice(0, 10);
  const { data: today } = await supabaseAdmin
    .from("iptv_catalog_daily")
    .select("added_channels, added_movies, added_series, removed_count")
    .eq("server_id", serverId)
    .eq("day", day)
    .maybeSingle();
  const prevDay = (today ?? {
    added_channels: 0,
    added_movies: 0,
    added_series: 0,
    removed_count: 0,
  }) as Record<string, number>;

  await supabaseAdmin.from("iptv_catalog_daily").upsert(
    {
      server_id: serverId,
      day,
      channels: totals.live,
      movies: totals.vod,
      series: totals.series,
      added_channels: (prevDay["added_channels"] ?? 0) + (firstRun ? 0 : added.live),
      added_movies: (prevDay["added_movies"] ?? 0) + (firstRun ? 0 : added.vod),
      added_series: (prevDay["added_series"] ?? 0) + (firstRun ? 0 : added.series),
      removed_count: (prevDay["removed_count"] ?? 0) + removedKeys.length,
      sync_ms: syncMs,
    } as never,
    { onConflict: "server_id,day" },
  );

  await supabaseAdmin
    .from("servers")
    .update({ catalog_hash: hash, catalog_synced_at: nowIso, catalog_sync_ms: syncMs } as never)
    .eq("id", serverId);

  // Atualiza estatísticas globais para o ranking
  const totalAdded = added.live + added.vod + added.series;
  if (!firstRun) {
    await supabaseAdmin.rpc("update_catalog_stats", {
      _server_id: serverId,
      _added_count: totalAdded,
      _total: totals.live + totals.vod + totals.series,
    });
  }

  // Registra no histórico global se houver novos itens e notifica
  if (changes.length > 0) {
    const { notifyNewContent } = await import("./iptv-notify.server");
    const newItems = changes.filter((c: any) => c.action === "added");
    
    // Alerta de Grande Atualização
    if (newItems.length >= 50) {
      await notifyNewContent(serverId, { kind: "system", name: "Grande Atualização", category: null }, { isFirst: true });
    }

    for (const item of newItems) {
      const tKey = titleKey(item.name as string);
      
      // Upsert no histórico global
      const { data: existing } = await supabaseAdmin
        .from("tmdb_content_history")
        .select("title_key")
        .eq("title_key", tKey)
        .maybeSingle();

      await supabaseAdmin.from("tmdb_content_history").upsert(
        {
          title_key: tKey,
          media_type: item.kind === "live" ? "live" : (item.kind === "series" ? "tv" : "movie"),
          last_detected_at: nowIso,
          discovery_server_id: serverId,
          ...(existing ? {} : { first_seen_at: nowIso }),
        } as never,
        { onConflict: "title_key,media_type" }
      );

      // Notifica se for o primeiro servidor (ou um dos primeiros) a ter esse conteúdo
      // Ou se for conteúdo raro (lógica a ser expandida no futuro, por enquanto usamos isFirst se for novo global)
      if (!existing && newItems.length < 50) {
        await notifyNewContent(serverId, {
          kind: item.kind as string,
          name: item.name as string,
          category: item.category as string | null
        }, { isFirst: true });
      } else if (newItems.length < 50) {
        // Se não for novo global, ainda notificamos mas sem a flag isFirst (cairá na fila/resumo)
        await notifyNewContent(serverId, {
          kind: item.kind as string,
          name: item.name as string,
          category: item.category as string | null
        });
      }
    }
  }

  return {
    skipped: false,
    hash,
    sync_ms: syncMs,
    added: firstRun ? { live: 0, vod: 0, series: 0 } : added,
    removed: removedKeys.length,
    totals,
  };
}
