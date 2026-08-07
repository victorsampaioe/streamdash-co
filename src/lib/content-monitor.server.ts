// Monitor de Conteúdos Offline — engine server-only.
// Importa o catálogo (Player API / Xtream, fallback M3U), testa os streams de
// forma controlada (GET parcial), classifica o status e gera resumo + alertas.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIptvCredentials } from "./iptv-credentials.server";
import { encryptSecret, decryptSecret } from "./crypto.server";
import { UA_PLAYER } from "./iptv.server";

export const CONNECT_TIMEOUT_MS = 8_000;
export const TOTAL_TIMEOUT_MS = 15_000;
export const MAX_BYTES = 256 * 1024;
export const SLOW_THRESHOLD_MS = 8_000;
export const BATCH_SIZE = 8; // legado (compatibilidade)

// ------------------------------------------------- Modo Seguro (padrão ligado)
/** Testes simultâneos por servidor no Modo Seguro. */
export const SAFE_CONCURRENCY = 5;
/** Teto de simultaneidade quando o Modo Seguro está desligado. */
export const CONCURRENCY = 20;
export const MAX_CONCURRENCY = 50;
export const MAX_SAFE_CONCURRENCY = 10;
/** Pausa entre lotes (ms) e respiro entre requisições do mesmo worker. */
export const SAFE_BATCH_PAUSE_MS = 2_000;
export const SAFE_REQUEST_DELAY_MS = 300;
/** % de respostas 401/403/429 que caracteriza bloqueio do servidor. */
export const BLOCK_SIGNAL_PCT = 0.25;
export const MIN_BLOCK_SAMPLE = 6;

export const HEAD_TIMEOUT_MS = 4_000;
export const GENERAL_FAILURE_PCT = 0.3;

/** Cache do catálogo: só chama a Player API se passou desse intervalo. */
export const CATALOG_TTL_MINUTES = 120;

/** Intervalo mínimo entre testes por faixa de prioridade (minutos). */
export const TIER_INTERVAL_MIN = {
  live: 15,       // canais ao vivo (amostra por categoria)
  hot: 60,        // favoritos, novos e que falharam antes
  recent: 720,    // filmes/séries recentes
  cold: 2880,     // catálogo antigo, verificação bem lenta
};

/** Máximo de canais testados por categoria em cada rodada. */
export const LIVE_SAMPLE_PER_CATEGORY = 3;


export type ContentStatus =
  | "unknown" | "online" | "slow" | "suspect" | "unstable" | "offline" | "blocked" | "removed";
export type ContentKind = "live" | "movie" | "series" | "episode";

export const STATUS_LABEL: Record<ContentStatus, string> = {
  unknown: "⚪ Sem análise",
  online: "🟢 Online",
  slow: "🟡 Lento",
  suspect: "🟡 Suspeito",
  unstable: "🟠 Instável",
  offline: "🔴 Offline",
  blocked: "🔒 Bloqueado",
  removed: "⚫ Removido",
};

// ---------------------------------------------------------------- utilidades

function baseUrl(host: string) {
  return `http://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

/** Bloqueia SSRF para localhost / redes privadas / metadados de nuvem. */
export function isForbiddenHost(host: string): boolean {
  const h = host.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

async function jsonApi(host: string, u: string, p: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ username: u, password: p, ...params }).toString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${baseUrl(host)}/player_api.php?${qs}`, {
      headers: { "user-agent": UA_PLAYER, accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- importação

type ImportRow = {
  external_content_id: string;
  content_type: ContentKind;
  name: string;
  category_name: string | null;
  cover_url: string | null;
  container_ext: string | null;
  parent_external_id?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
};

/** Última sincronização do catálogo monitorado (cache). */
export async function catalogSyncedAt(serverId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("monitored_contents")
    .select("last_seen_at")
    .eq("server_id", serverId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_seen_at ?? null;
}

/** Importa/atualiza o catálogo monitorado de um servidor. */
export async function importServerCatalog(
  serverId: string,
  opts: { limitPerKind?: number; force?: boolean } = {},
) {
  const limit = opts.limitPerKind ?? 1500;
  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("id, owner_id, name, host")
    .eq("id", serverId)
    .maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");
  if (isForbiddenHost(server.host)) throw new Error("Host não permitido");

  // Cache: evita bater na Player API toda hora.
  if (!opts.force) {
    const last = await catalogSyncedAt(serverId);
    if (last && Date.now() - new Date(last).getTime() < CATALOG_TTL_MINUTES * 60_000) {
      const { count } = await supabaseAdmin
        .from("monitored_contents")
        .select("id", { count: "exact", head: true })
        .eq("server_id", serverId);
      return { imported: count ?? 0, upserted: 0, cached: true, syncedAt: last };
    }
  }


  const { username, password } = await getIptvCredentials(serverId);
  if (!username || !password) throw new Error("Servidor sem credenciais Xtream cadastradas");

  const rows: ImportRow[] = [];

  const [liveCats, vodCats, serCats] = await Promise.all([
    jsonApi(server.host, username, password, { action: "get_live_categories" }),
    jsonApi(server.host, username, password, { action: "get_vod_categories" }),
    jsonApi(server.host, username, password, { action: "get_series_categories" }),
  ]);
  const catName = (list: any, id: any) =>
    (Array.isArray(list) ? list.find((c: any) => String(c.category_id) === String(id)) : null)
      ?.category_name ?? null;

  const [live, vod, series] = await Promise.all([
    jsonApi(server.host, username, password, { action: "get_live_streams" }),
    jsonApi(server.host, username, password, { action: "get_vod_streams" }),
    jsonApi(server.host, username, password, { action: "get_series" }),
  ]);

  if (Array.isArray(live)) {
    for (const s of live.slice(0, limit)) {
      rows.push({
        external_content_id: String(s.stream_id),
        content_type: "live",
        name: String(s.name ?? "Canal"),
        category_name: catName(liveCats, s.category_id),
        cover_url: s.stream_icon ?? null,
        container_ext: "ts",
      });
    }
  }
  if (Array.isArray(vod)) {
    for (const s of vod.slice(0, limit)) {
      rows.push({
        external_content_id: String(s.stream_id),
        content_type: "movie",
        name: String(s.name ?? "Filme"),
        category_name: catName(vodCats, s.category_id),
        cover_url: s.stream_icon ?? s.cover ?? null,
        container_ext: s.container_extension ?? "mp4",
      });
    }
  }
  if (Array.isArray(series)) {
    for (const s of series.slice(0, limit)) {
      rows.push({
        external_content_id: String(s.series_id),
        content_type: "series",
        name: String(s.name ?? "Série"),
        category_name: catName(serCats, s.category_id),
        cover_url: s.cover ?? null,
        container_ext: null,
      });
    }
  }

  if (!rows.length) throw new Error("Player API não retornou conteúdos (verifique credenciais/DNS)");

  const nowIso = new Date().toISOString();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      ...r,
      server_id: serverId,
      reseller_id: server.owner_id,
      last_seen_at: nowIso,
    }));
    const { error, count } = await supabaseAdmin
      .from("monitored_contents")
      .upsert(chunk as any, { onConflict: "server_id,content_type,external_content_id", count: "exact" });
    if (error) throw new Error(error.message);
    inserted += count ?? chunk.length;
  }

  // Conteúdos que sumiram da Player API viram "removed".
  await supabaseAdmin
    .from("monitored_contents")
    .update({ current_status: "removed" })
    .eq("server_id", serverId)
    .lt("last_seen_at", nowIso)
    .neq("current_status", "removed");

  return { imported: rows.length, upserted: inserted };
}

/** Importa episódios de uma série (sob demanda, evita explodir o banco). */
export async function importSeriesEpisodes(serverId: string, seriesExternalId: string) {
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, host").eq("id", serverId).maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");
  const { username, password } = await getIptvCredentials(serverId);
  if (!username || !password) throw new Error("Sem credenciais");
  const info = await jsonApi(server.host, username, password, {
    action: "get_series_info",
    series_id: seriesExternalId,
  });
  const eps = info?.episodes ?? {};
  const rows: any[] = [];
  for (const season of Object.keys(eps)) {
    for (const ep of eps[season] ?? []) {
      rows.push({
        server_id: serverId,
        reseller_id: server.owner_id,
        external_content_id: String(ep.id),
        content_type: "episode",
        name: `${info?.info?.name ?? "Série"} S${season}E${ep.episode_num} — ${ep.title ?? ""}`.trim(),
        category_name: info?.info?.genre ?? null,
        cover_url: info?.info?.cover ?? null,
        container_ext: ep.container_extension ?? "mp4",
        parent_external_id: seriesExternalId,
        season_number: Number(season) || null,
        episode_number: Number(ep.episode_num) || null,
        last_seen_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length) {
    await supabaseAdmin
      .from("monitored_contents")
      .upsert(rows, { onConflict: "server_id,content_type,external_content_id" });
  }
  return { episodes: rows.length };
}

// ------------------------------------------------------------------- testes

export type ProbeResult = {
  status: ContentStatus;
  http_status: number | null;
  response_time_ms: number | null;
  first_byte_time_ms: number | null;
  bytes_received: number;
  detected_format: string | null;
  error_message: string | null;
};

function streamUrl(host: string, u: string, p: string, row: any): string {
  const b = baseUrl(host);
  const ext = row.container_ext || (row.content_type === "live" ? "ts" : "mp4");
  if (row.content_type === "live") return `${b}/live/${u}/${p}/${row.external_content_id}.${ext}`;
  if (row.content_type === "episode") return `${b}/series/${u}/${p}/${row.external_content_id}.${ext}`;
  return `${b}/movie/${u}/${p}/${row.external_content_id}.${ext}`;
}

/**
 * HEAD rápido: descarta cedo os casos óbvios (401/403/404) sem gastar
 * banda com o GET parcial. Retorna null quando é preciso testar de verdade.
 */
export async function headPrecheck(
  url: string,
): Promise<{ verdict: ProbeResult | null; ms: number }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": UA_PLAYER, accept: "*/*" },
      signal: ctrl.signal,
    });
    const ms = Date.now() - started;
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { verdict: fail("blocked", res.status, started, `HTTP ${res.status}`), ms };
    }
    if (res.status === 404 || res.status === 410) {
      return { verdict: fail("removed", res.status, started, `HTTP ${res.status}`), ms };
    }
    return { verdict: null, ms };
  } catch {
    // HEAD falhou/não suportado: segue para o teste completo.
    return { verdict: null, ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

/** Executa `worker` sobre `items` com pool de concorrência fixa (rolling). */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

/** GET parcial com timeout e limite de bytes. Nunca baixa o conteúdo inteiro. */
export async function probeContentUrl(url: string, opts: { head?: boolean } = {}): Promise<ProbeResult> {
  if (opts.head) {
    const pre = await headPrecheck(url);
    if (pre.verdict) return pre.verdict;
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const hard = setTimeout(() => ctrl.abort(), TOTAL_TIMEOUT_MS);
  const connect = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS + TOTAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": UA_PLAYER, range: `bytes=0-${MAX_BYTES - 1}`, accept: "*/*" },
      signal: ctrl.signal,
    });
    const http = res.status;
    if (http === 401 || http === 403 || http === 429) {
      return fail("blocked", http, started, `HTTP ${http}`);
    }
    if (http === 404 || http === 410) {
      return fail("removed", http, started, `HTTP ${http}`);
    }
    if (http >= 400) {
      return fail("offline", http, started, `HTTP ${http}`);
    }

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    const reader = res.body?.getReader();
    if (!reader) return fail("offline", http, started, "Sem corpo de resposta");

    let bytes = 0;
    let firstByteAt: number | null = null;
    let head = "";
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        if (firstByteAt === null) firstByteAt = Date.now();
        bytes += value.length;
        if (head.length < 2048) head += new TextDecoder().decode(value.slice(0, 2048));
      }
    }
    try { await reader.cancel(); } catch { /* noop */ }

    const total = Date.now() - started;
    const isHls = ctype.includes("mpegurl") || head.startsWith("#EXTM3U");
    let format: string | null = isHls ? "hls" : ctype.split(";")[0] || null;

    if (isHls) {
      const hasSegments = /\.(ts|m4s|aac)|#EXT-X-STREAM-INF|#EXTINF/i.test(head);
      if (!hasSegments) return fail("offline", http, started, "Manifesto HLS sem segmentos");
    } else {
      const looksVideo =
        ctype.includes("video") || ctype.includes("octet-stream") || ctype.includes("mp2t") || bytes > 8192;
      if (!looksVideo || bytes < 1024) {
        return fail("offline", http, started, `Sem dados de vídeo (${bytes} bytes, ${ctype || "sem content-type"})`);
      }
      format = format ?? "video";
    }

    return {
      status: total > SLOW_THRESHOLD_MS ? "slow" : "online",
      http_status: http,
      response_time_ms: total,
      first_byte_time_ms: firstByteAt ? firstByteAt - started : null,
      bytes_received: bytes,
      detected_format: format,
      error_message: null,
    };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout" : String(e?.message ?? e).slice(0, 200);
    return fail("offline", null, started, msg);
  } finally {
    clearTimeout(hard);
    clearTimeout(connect);
  }
}

function fail(status: ContentStatus, http: number | null, started: number, msg: string): ProbeResult {
  return {
    status,
    http_status: http,
    response_time_ms: Date.now() - started,
    first_byte_time_ms: null,
    bytes_received: 0,
    detected_format: null,
    error_message: msg,
  };
}

/**
 * Regra anti-falso-positivo em 3 etapas:
 * 1ª falha → 🟡 Suspeito · 2ª → 🟠 Instável · 3ª → 🔴 Offline.
 * `protectedMode` = servidor aparentando bloquear as verificações: nesse caso
 * não rebaixamos o conteúdo, só marcamos como suspeito.
 */
export function classify(
  prev: { current_status: ContentStatus; consecutive_failures: number },
  probe: ProbeResult,
  protectedMode = false,
) {
  if (probe.status === "removed") {
    return { status: probe.status, failures: prev.consecutive_failures + 1 };
  }
  if (probe.status === "blocked") {
    const failures = prev.consecutive_failures + 1;
    // Bloqueio pode ser proteção anti-bot do servidor: não condenar de cara.
    if (protectedMode || failures < 2) return { status: "suspect" as ContentStatus, failures };
    return { status: "blocked" as ContentStatus, failures };
  }
  if (probe.status !== "offline") return { status: probe.status, failures: 0 };

  const failures = prev.consecutive_failures + 1;
  if (protectedMode) return { status: "suspect" as ContentStatus, failures };
  if (failures >= 3) return { status: "offline" as ContentStatus, failures };
  if (failures === 2) return { status: "unstable" as ContentStatus, failures };
  return { status: "suspect" as ContentStatus, failures };
}

// --------------------------------------------------------------- fila / lote

function cutoff(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const dueFilter = (q: any, minutes: number) =>
  q.or(`last_checked_at.is.null,last_checked_at.lt.${cutoff(minutes)}`);

async function tierRows(serverId: string, size: number, build: (q: any) => any) {
  if (size <= 0) return [];
  let q = supabaseAdmin
    .from("monitored_contents")
    .select("*")
    .eq("server_id", serverId)
    .neq("current_status", "removed");
  q = build(q);
  const { data } = await q
    .order("priority", { ascending: false })
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(size);
  return data ?? [];
}

/**
 * Canais ao vivo: nunca testamos a grade inteira.
 * Pegamos só uma amostra por categoria (favoritos primeiro) e giramos as
 * categorias conforme a hora do dia, para distribuir a carga no servidor.
 */
async function pickLiveSample(serverId: string, size: number) {
  if (size <= 0) return [];
  const rows = await tierRows(serverId, size * 8, (q) =>
    dueFilter(q.eq("content_type", "live"), TIER_INTERVAL_MIN.live));
  if (!rows.length) return [];

  const byCat = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.category_name || "sem categoria";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(r);
  }

  // Rotação por hora: categorias diferentes em horários diferentes.
  const cats = Array.from(byCat.keys()).sort();
  const offset = new Date().getUTCHours() % Math.max(1, cats.length);
  const rotated = [...cats.slice(offset), ...cats.slice(0, offset)];

  const out: any[] = [];
  for (const cat of rotated) {
    const list = byCat.get(cat)!
      .sort((a, b) =>
        Number(b.is_favorite) - Number(a.is_favorite) ||
        (b.priority ?? 0) - (a.priority ?? 0) ||
        (b.consecutive_failures ?? 0) - (a.consecutive_failures ?? 0));
    out.push(...list.slice(0, LIVE_SAMPLE_PER_CATEGORY));
    if (out.length >= size) break;
  }
  return out.slice(0, size);
}

/**
 * Fila inteligente do Modo Seguro:
 *  1) canais ao vivo — amostra por categoria, com rodízio de horário
 *  2) favoritos / conteúdos novos / que já falharam antes
 *  3) filmes e séries recentes (verificação lenta)
 *  4) catálogo antigo (bem esporádico, só sobra de lote)
 */
export async function pickQueue(serverId: string, size: number) {
  const seen = new Set<string>();
  const out: any[] = [];
  const push = (rows: any[]) => {
    for (const r of rows) {
      if (out.length >= size || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  };

  push(await pickLiveSample(serverId, Math.ceil(size * 0.3)));

  // Filmes/séries: prioridade para novos, com erro e favoritos.
  push(await tierRows(serverId, Math.ceil(size * 0.45), (q) =>
    dueFilter(
      q.neq("content_type", "live")
        .or("is_favorite.eq.true,consecutive_failures.gt.0,current_status.eq.unknown,current_status.eq.suspect"),
      TIER_INTERVAL_MIN.hot,
    )));

  push(await tierRows(serverId, size - out.length, (q) =>
    dueFilter(
      q.neq("content_type", "live").gt("first_seen_at", cutoff(60 * 24 * 14)),
      TIER_INTERVAL_MIN.recent,
    )));

  push(await tierRows(serverId, Math.min(size - out.length, Math.ceil(size * 0.15)), (q) =>
    dueFilter(q.neq("content_type", "live"), TIER_INTERVAL_MIN.cold)));

  return out.slice(0, size);
}

/** Amostra rápida usada pela Verificação Turbo (canais + falhas + favoritos). */
async function pickTurboSample(serverId: string, size: number) {
  const seen = new Set<string>();
  const out: any[] = [];
  const push = (rows: any[]) => {
    for (const r of rows) {
      if (out.length >= size || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  };
  push(await tierRows(serverId, Math.ceil(size * 0.4), (q) =>
    q.gt("consecutive_failures", 0)));
  push(await tierRows(serverId, Math.ceil(size * 0.3), (q) =>
    q.eq("content_type", "live")));
  push(await tierRows(serverId, size - out.length, (q) => q.eq("is_favorite", true)));
  push(await tierRows(serverId, size - out.length, (q) => q));
  return out.slice(0, size);
}

export async function runContentScan(
  serverId: string,
  opts: {
    batch?: number;
    concurrency?: number;
    contentIds?: string[];
    manual?: boolean;
    userId?: string;
    turbo?: boolean;
    head?: boolean;
    /** Modo Seguro (padrão): poucos testes simultâneos, pausa entre lotes e freio adaptativo. */
    safe?: boolean;
    /** Ignora o descanso ativo (usado em verificações manuais). */
    ignoreCooldown?: boolean;
  } = {},
) {
  const safe = opts.safe ?? true;
  const batch = Math.min(opts.batch ?? 40, 300);

  const {
    getThrottle, escalateThrottle, relaxThrottle, isCoolingDown,
    THROTTLE_FACTOR, sleep,
  } = await import("./content-safe.server");

  const throttle = await getThrottle(serverId);
  if (safe && !opts.ignoreCooldown && isCoolingDown(throttle)) {
    return {
      tested: 0, failed: 0, recovered: 0, generalFailure: false,
      concurrency: 0, safe: true, throttleLevel: throttle.level,
      cooldownUntil: throttle.cooldownUntil, blocked: true,
      skipped: "Servidor em descanso (Modo Seguro)",
    };
  }

  const factor = THROTTLE_FACTOR[Math.min(throttle.level, THROTTLE_FACTOR.length - 1)];
  const concurrency = safe
    ? Math.max(1, Math.floor(
        Math.min(opts.concurrency ?? SAFE_CONCURRENCY, MAX_SAFE_CONCURRENCY) / factor))
    : Math.min(Math.max(1, opts.concurrency ?? CONCURRENCY), MAX_CONCURRENCY);
  const batchPause = safe ? SAFE_BATCH_PAUSE_MS * factor : 0;
  const requestDelay = safe ? SAFE_REQUEST_DELAY_MS * factor : 0;

  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, name, host").eq("id", serverId).maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");
  if (isForbiddenHost(server.host)) throw new Error("Host não permitido");
  const { username, password } = await getIptvCredentials(serverId);
  if (!username || !password) throw new Error("Servidor sem credenciais Xtream");

  const { data: run } = await supabaseAdmin
    .from("content_scan_runs")
    .insert({ server_id: serverId, triggered_by: opts.userId ?? null })
    .select("id")
    .single();

  let queue: any[];
  if (opts.contentIds?.length) {
    const { data } = await supabaseAdmin
      .from("monitored_contents").select("*").eq("server_id", serverId).in("id", opts.contentIds);
    queue = data ?? [];
  } else if (opts.turbo) {
    queue = await pickTurboSample(serverId, batch);
  } else {
    queue = await pickQueue(serverId, batch);
  }

  let tested = 0, failed = 0, recovered = 0, blockSignals = 0;
  let protectedMode = false;
  let aborted = false;
  const events: { row: any; status: ContentStatus; probe: ProbeResult }[] = [];
  const checkRows: any[] = [];

  const testOne = async (row: any) => {
    const probe = await probeContentUrl(
      streamUrl(server.host, username, password, row),
      { head: opts.head ?? true },
    );
    if (probe.http_status === 401 || probe.http_status === 403 || probe.http_status === 429) {
      blockSignals++;
    }
    const { status, failures } = classify(row, probe, protectedMode);
    const wasBad = ["offline", "blocked", "removed", "unstable", "suspect"].includes(row.current_status);
    const isBad = ["offline", "blocked", "removed"].includes(status);
    tested++;
    if (isBad) failed++;
    if (wasBad && (status === "online" || status === "slow")) recovered++;

    checkRows.push({
      content_id: row.id,
      server_id: serverId,
      status,
      http_status: probe.http_status,
      response_time_ms: probe.response_time_ms,
      first_byte_time_ms: probe.first_byte_time_ms,
      bytes_received: probe.bytes_received,
      detected_format: probe.detected_format,
      error_message: probe.error_message,
      manual: !!opts.manual,
      checked_by: opts.userId ?? null,
    });

    const now = new Date().toISOString();
    await supabaseAdmin.from("monitored_contents").update({
      current_status: status,
      consecutive_failures: failures,
      response_time_ms: probe.response_time_ms,
      http_status: probe.http_status,
      last_error: probe.error_message,
      last_checked_at: now,
      ...(status === "online" || status === "slow" ? { last_online_at: now } : {}),
    }).eq("id", row.id);

    if (row.current_status !== status) events.push({ row, status, probe });
    if (requestDelay) await sleep(requestDelay);
  };

  // Lotes pequenos, com pausa entre eles: nunca testamos tudo de uma vez.
  for (let i = 0; i < queue.length; i += concurrency) {
    const slice = queue.slice(i, i + concurrency);
    await runPool(slice, concurrency, testOne);

    // Freio adaptativo: muitos 401/403/429 => o servidor está nos barrando.
    if (safe && !protectedMode && tested >= MIN_BLOCK_SAMPLE
      && blockSignals / tested >= BLOCK_SIGNAL_PCT) {
      protectedMode = true;
      aborted = true;
      break;
    }
    if (batchPause && i + concurrency < queue.length) await sleep(batchPause);
  }

  // Histórico gravado em lote (menos escritas no banco).
  for (let i = 0; i < checkRows.length; i += 200) {
    await supabaseAdmin.from("content_checks").insert(checkRows.slice(i, i + 200));
  }

  let newThrottle = throttle;
  if (safe) {
    newThrottle = protectedMode
      ? await escalateThrottle(serverId)
      : (tested > 0 ? await relaxThrottle(serverId) : throttle);
  }

  // Detector de falha geral: muitos erros de uma vez => provável problema no servidor.
  const generalFailure = !protectedMode && tested >= 10 && failed / tested >= GENERAL_FAILURE_PCT;

  const note = protectedMode
    ? "🚨 Servidor pode estar bloqueando verificações automáticas — velocidade reduzida"
    : generalFailure
      ? "Possível falha geral do servidor — testes suspensos"
      : opts.turbo ? "Verificação Turbo (amostra)" : null;

  if (run) {
    await supabaseAdmin.from("content_scan_runs").update({
      finished_at: new Date().toISOString(),
      tested, failed, recovered,
      general_failure: generalFailure || protectedMode,
      note,
    }).eq("id", run.id);
  }

  await upsertDailySummary(serverId);

  try {
    const { dispatchAlerts } = await import("./alert-state.server");
    await dispatchAlerts(
      serverId,
      protectedMode
        ? [{
            kind: "content_protection",
            severity: "warning" as const,
            title: "🚨 Servidor pode estar bloqueando verificações automáticas",
            detail:
              `${blockSignals} de ${tested} testes retornaram 401/403/429. ` +
              `O Modo Seguro reduziu a velocidade (nível ${newThrottle.level}) e o servidor ` +
              `ficará em descanso até ${newThrottle.cooldownUntil ? new Date(newThrottle.cooldownUntil).toLocaleString("pt-BR") : "a próxima rodada"}. ` +
              `Nenhum conteúdo foi marcado como offline nesta rodada.`,
          }]
        : [],
      ["content_protection"],
    );
  } catch { /* alerta nunca quebra o scan */ }


  try {
    const { notifyContentEvents } = await import("./content-alerts.server");
    await notifyContentEvents(server as any, events, { tested, failed, recovered, generalFailure });
  } catch { /* alertas nunca quebram o scan */ }

  return {
    tested, failed, recovered, generalFailure, concurrency,
    safe, aborted, blockSignals, protectedMode,
    throttleLevel: newThrottle.level,
    cooldownUntil: newThrottle.cooldownUntil,
  };
}

/**
 * Verificação Turbo: visão geral do servidor em segundos.
 * Ping na Player API + validação do catálogo + amostra priorizada de streams.
 */
export async function runTurboScan(
  serverId: string,
  opts: { sample?: number; concurrency?: number; userId?: string } = {},
) {
  const started = Date.now();
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, host").eq("id", serverId).maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");
  if (isForbiddenHost(server.host)) throw new Error("Host não permitido");
  const { username, password } = await getIptvCredentials(serverId);
  if (!username || !password) throw new Error("Servidor sem credenciais Xtream");

  const apiStart = Date.now();
  const info = await jsonApi(server.host, username, password, {});
  const apiMs = Date.now() - apiStart;
  const apiOk = !!info?.user_info;

  const [{ count: catalogCount }, syncedAt] = await Promise.all([
    supabaseAdmin
      .from("monitored_contents")
      .select("id", { count: "exact", head: true })
      .eq("server_id", serverId),
    catalogSyncedAt(serverId),
  ]);

  const scan = await runContentScan(serverId, {
    batch: opts.sample ?? 24,
    concurrency: opts.concurrency ?? SAFE_CONCURRENCY,
    turbo: true,
    manual: true,
    userId: opts.userId,
    head: true,
    safe: true,
    ignoreCooldown: true,
  });

  return {
    apiOk,
    apiMs,
    catalog: catalogCount ?? 0,
    catalogSyncedAt: syncedAt,
    sample: scan.tested,
    failed: scan.failed,
    recovered: scan.recovered,
    generalFailure: scan.generalFailure,
    protectedMode: !!scan.protectedMode,
    throttleLevel: scan.throttleLevel ?? 0,
    elapsedMs: Date.now() - started,
  };
}


/** Percorre servidores elegíveis (assinatura ativa) e roda um lote em cada um. */
export async function runDueContentScans() {
  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select("id, owner_id")
    .not("iptv_username", "is", null)
    .eq("monitoring_paused", false);
  if (!servers?.length) return { servers: 0, tested: 0 };

  const { getActiveOwnerIds } = await import("./service-status.server");
  const active = await getActiveOwnerIds(servers.map((s) => s.owner_id));

  const eligible = servers.filter((s) => active.has(s.owner_id));
  let tested = 0, count = 0, throttled = 0;
  // Modo Seguro: só 2 servidores por vez, lotes pequenos e pausados em cada um.
  await runPool(eligible, 2, async (s) => {
    try {
      const r = await runContentScan(s.id, { batch: 40, safe: true });
      tested += r.tested;
      if ((r as any).protectedMode || (r as any).blocked) throttled++;
      count++;
    } catch { /* ignora servidor com erro */ }
  });
  return { servers: count, tested, throttled };

}

// -------------------------------------------------------- resumo / score

export function contentHealthScore(agg: {
  total: number; online: number; slow: number; unstable: number; offline: number;
  blocked: number; removed: number; recovered: number; avg_ms: number | null;
}): number {
  if (!agg.total) return 0;
  const okPct = (agg.online + agg.slow) / agg.total;
  const stability = 1 - (agg.unstable + agg.offline + agg.blocked) / agg.total;
  const speed = agg.avg_ms == null ? 1 : Math.max(0, 1 - Math.max(0, agg.avg_ms - 2000) / 10000);
  const failures = 1 - Math.min(1, (agg.offline + agg.removed) / agg.total);
  const recovery = agg.recovered > 0 ? 1 : 0.6;
  const regional = 1; // reservado para comparação multi-região
  const score =
    okPct * 40 + stability * 20 + speed * 15 + failures * 15 + recovery * 5 + regional * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score: number) {
  if (score >= 90) return { label: "Excelente", tone: "success" as const };
  if (score >= 80) return { label: "Bom", tone: "success" as const };
  if (score >= 70) return { label: "Atenção", tone: "warning" as const };
  if (score >= 50) return { label: "Ruim", tone: "warning" as const };
  return { label: "Crítico", tone: "destructive" as const };
}

export async function upsertDailySummary(serverId: string) {
  const { data: rows } = await supabaseAdmin
    .from("monitored_contents")
    .select("current_status, response_time_ms")
    .eq("server_id", serverId);
  const list = rows ?? [];
  const c = (s: string) => list.filter((r) => r.current_status === s).length;
  const times = list.map((r) => r.response_time_ms).filter((n): n is number => typeof n === "number");
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: recovered } = await supabaseAdmin
    .from("content_scan_runs")
    .select("recovered")
    .eq("server_id", serverId)
    .gte("started_at", `${today}T00:00:00Z`);
  const recoveredCount = (recovered ?? []).reduce((a, r) => a + (r.recovered ?? 0), 0);

  const agg = {
    total: list.length,
    online: c("online"), slow: c("slow"), unstable: c("unstable"),
    offline: c("offline"), blocked: c("blocked"), removed: c("removed"),
    recovered: recoveredCount, avg_ms: avg,
  };

  await supabaseAdmin.from("content_daily_summary").upsert({
    server_id: serverId,
    summary_date: today,
    total_contents: agg.total,
    online_count: agg.online,
    offline_count: agg.offline,
    unstable_count: agg.unstable,
    slow_count: agg.slow,
    blocked_count: agg.blocked,
    removed_count: agg.removed,
    recovered_count: agg.recovered,
    average_response_time: agg.avg_ms,
    health_score: contentHealthScore(agg),
  }, { onConflict: "server_id,summary_date" });

  return agg;
}

// ------------------------------------------- Catálogo Quebrado Inteligente

export async function brokenCatalogInsights(userId: string) {
  const { data: servers } = await supabaseAdmin
    .from("servers").select("id, name").eq("owner_id", userId);
  const ids = (servers ?? []).map((s) => s.id);
  if (!ids.length) return { servers: [], worstServer: null, bestServer: null, crossBroken: [], newBroken: [] };

  const { data: contents } = await supabaseAdmin
    .from("monitored_contents")
    .select("server_id, name, content_type, current_status, response_time_ms, first_seen_at")
    .in("server_id", ids);
  const list = contents ?? [];

  const perServer = (servers ?? []).map((s) => {
    const mine = list.filter((c) => c.server_id === s.id);
    const ok = mine.filter((c) => c.current_status === "online" || c.current_status === "slow").length;
    return {
      id: s.id,
      name: s.name,
      total: mine.length,
      offline: mine.filter((c) => c.current_status === "offline").length,
      healthPct: mine.length ? Math.round((ok / mine.length) * 1000) / 10 : 0,
    };
  }).filter((s) => s.total > 0);

  const byTitle = new Map<string, Set<string>>();
  for (const c of list) {
    if (c.current_status !== "offline") continue;
    const key = c.name.toLowerCase().trim();
    if (!byTitle.has(key)) byTitle.set(key, new Set());
    byTitle.get(key)!.add(c.server_id);
  }
  const crossBroken = Array.from(byTitle.entries())
    .filter(([, s]) => s.size > 1)
    .map(([name, s]) => ({ name, servers: s.size }))
    .sort((a, b) => b.servers - a.servers)
    .slice(0, 20);

  const weekAgo = Date.now() - 7 * 86400000;
  const newBroken = list
    .filter((c) => c.current_status === "offline" && new Date(c.first_seen_at).getTime() > weekAgo)
    .slice(0, 20)
    .map((c) => ({ name: c.name, type: c.content_type }));

  const slowest = list
    .filter((c) => c.current_status === "slow")
    .sort((a, b) => (b.response_time_ms ?? 0) - (a.response_time_ms ?? 0))
    .slice(0, 10)
    .map((c) => ({ name: c.name, ms: c.response_time_ms }));

  const sorted = [...perServer].sort((a, b) => b.healthPct - a.healthPct);
  return {
    servers: perServer,
    bestServer: sorted[0] ?? null,
    worstServer: sorted[sorted.length - 1] ?? null,
    crossBroken,
    newBroken,
    slowest,
    totalServers: perServer.length,
  };
}

export { encryptSecret, decryptSecret };
