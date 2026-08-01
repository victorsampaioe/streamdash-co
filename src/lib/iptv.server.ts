// Server-only IPTV intelligence engine.
// Low impact by design: sampling, caching, rate limits and configurable intervals.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_TIMEOUT_MS = 12_000;
const M3U_TIMEOUT_MS = 20_000;
const STREAM_TIMEOUT_MS = 10_000;
const STREAM_SAMPLE_BYTES = 350_000; // ~ enough to estimate bitrate without draining the server
const MIN_GAP_MS = 5 * 60_000; // internal rate limit per server

export type StreamProbe = {
  kind: "live" | "vod" | "series";
  label: string | null;
  ok: boolean;
  start_ms: number | null;
  total_ms: number | null;
  bitrate_kbps: number | null;
  resolution: string | null;
  codec: string | null;
  buffer_ms: number | null;
  error: string | null;
};

type ServerRow = {
  id: string;
  owner_id: string;
  name: string;
  host: string;
  iptv_mode: "basic" | "smart" | "full";
  iptv_interval_minutes: number;
  iptv_username: string | null;
  iptv_password: string | null;
  iptv_detected: "none" | "xtream" | "m3u" | "both";
  iptv_sample_size: number;
  iptv_stream_tests: boolean;
  last_iptv_sync_at: string | null;
  last_latency_ms: number | null;
};

function base(host: string) {
  return `http://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

async function timedFetch(url: string, ms: number, init?: RequestInit) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { redirect: "follow", signal: ctl.signal, ...init });
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

export async function detectIptvKind(
  host: string,
  username?: string | null,
  password?: string | null,
): Promise<{ kind: "none" | "xtream" | "m3u" | "both"; details: Record<string, unknown> }> {
  const b = base(host);
  const u = username ?? "test";
  const p = password ?? "test";
  let xtream = false;
  let m3u = false;
  const details: Record<string, unknown> = {};

  try {
    const res = await timedFetch(`${b}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`, API_TIMEOUT_MS);
    const text = await res.text();
    details.player_api_status = res.status;
    if (res.ok && /^\s*[[{]/.test(text)) {
      const json = JSON.parse(text);
      xtream = typeof json === "object" && json !== null;
      details.auth = json?.user_info?.auth ?? null;
    }
  } catch (e: unknown) {
    details.player_api_error = String((e as Error)?.message ?? e).slice(0, 160);
  }

  try {
    const res = await timedFetch(
      `${b}/get.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&type=m3u_plus&output=ts`,
      API_TIMEOUT_MS,
      { headers: { Range: "bytes=0-2048" } },
    );
    const head = (await res.text()).slice(0, 2048);
    details.m3u_status = res.status;
    if (res.status < 500 && /#EXTM3U/i.test(head)) m3u = true;
  } catch (e: unknown) {
    details.m3u_error = String((e as Error)?.message ?? e).slice(0, 160);
  }

  const kind = xtream && m3u ? "both" : xtream ? "xtream" : m3u ? "m3u" : "none";
  return { kind, details };
}

/* ------------------------------------------------------------------ */
/* Xtream Player API                                                   */
/* ------------------------------------------------------------------ */

export type PlayerApiDiagnostics = {
  url: string;
  final_url: string | null;
  redirected: boolean;
  http_status: number | null;
  status_text: string | null;
  elapsed_ms: number;
  content_type: string | null;
  size_bytes: number | null;
  body_snippet: string | null;
  stage: "network" | "http" | "empty" | "content-type" | "parse" | "ok";
  message: string;
};

type XtreamResult = {
  api_ms: number | null;
  login_ok: boolean;
  json_valid: boolean;
  reachable: boolean;
  login_checked: boolean;
  http_status: number | null;
  body_snippet: string | null;
  diagnostics: PlayerApiDiagnostics | null;
  channels: number | null;
  movies: number | null;
  series: number | null;
  categories: number | null;
  sampleLive: { id: string | number; name: string }[];
  sampleVod: { id: string | number; name: string; ext: string }[];
  sampleSeries: { id: string | number; name: string }[];
  error: string | null;
};

/** Remove credenciais da URL antes de registrar em logs. */
function safeUrl(url: string) {
  return url.replace(/(username|password)=[^&]*/gi, "$1=***");
}

class PlayerApiError extends Error {
  status: number | null;
  snippet: string | null;
  diag: PlayerApiDiagnostics;
  constructor(diag: PlayerApiDiagnostics) {
    super(diag.message);
    this.name = "PlayerApiError";
    this.status = diag.http_status;
    this.snippet = diag.body_snippet;
    this.diag = diag;
  }
}

/**
 * Busca JSON da Player API validando disponibilidade, status HTTP, corpo e
 * Content-Type ANTES do parse. Nunca propaga exceções cruas do JSON.parse.
 * Sempre devolve um diagnóstico completo (mascarando credenciais).
 */
async function getJson(
  url: string,
  ms = API_TIMEOUT_MS,
): Promise<{ data: unknown; diag: PlayerApiDiagnostics }> {
  const t0 = Date.now();
  const masked = safeUrl(url);
  let res: Response;
  try {
    res = await timedFetch(url, ms);
  } catch (e: unknown) {
    const aborted = (e as Error)?.name === "AbortError";
    const diag: PlayerApiDiagnostics = {
      url: masked,
      final_url: null,
      redirected: false,
      http_status: null,
      status_text: null,
      elapsed_ms: Date.now() - t0,
      content_type: null,
      size_bytes: null,
      body_snippet: null,
      stage: "network",
      message: aborted
        ? "❌ Sem resposta: tempo limite excedido ao conectar no servidor."
        : `❌ Sem resposta do servidor (${String((e as Error)?.message ?? e).slice(0, 120)}).`,
    };
    console.warn("[iptv] player_api falhou", diag);
    throw new PlayerApiError(diag);
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (!/^set-cookie$|authorization/i.test(k)) headers[k] = v;
  });
  const ctype = (headers["content-type"] ?? "").toLowerCase();

  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }

  const diag: PlayerApiDiagnostics = {
    url: masked,
    final_url: res.url ? safeUrl(res.url) : null,
    redirected: Boolean(res.redirected) || (!!res.url && safeUrl(res.url) !== masked),
    http_status: res.status,
    status_text: res.statusText || null,
    elapsed_ms: Date.now() - t0,
    content_type: headers["content-type"] ?? null,
    size_bytes: text.length,
    body_snippet: text.slice(0, 500) || null,
    stage: "ok",
    message: "",
  };

  const fail = (stage: PlayerApiDiagnostics["stage"], message: string): never => {
    diag.stage = stage;
    diag.message = message;
    console.warn("[iptv] player_api", { ...diag, headers });
    throw new PlayerApiError(diag);
  };

  if (res.status !== 200) {
    const extra = res.status === 403 || res.status === 401 ? " (acesso bloqueado pelo servidor)" : "";
    fail("http", `❌ Servidor respondeu HTTP ${res.status}${extra}. Não foi possível validar o login.`);
  }

  const trimmed = text.trim();
  if (!trimmed) fail("empty", "❌ Resposta vazia da Player API (0 bytes). Não foi possível validar o login.");

  if (/^\s*(<!doctype|<html|<\?xml|<)/i.test(trimmed) || ctype.includes("text/html")) {
    fail("content-type", "❌ Player API retornou HTML em vez de JSON (possível bloqueio/proxy).");
  }

  if (ctype && !/(json|text\/plain|application\/octet-stream)/.test(ctype)) {
    fail("content-type", `❌ Content-Type inesperado (${ctype.split(";")[0]}). Resposta não é JSON.`);
  }

  try {
    return { data: JSON.parse(trimmed), diag };
  } catch {
    fail("parse", "❌ Resposta incompleta ou inválida: não foi possível interpretar o JSON.");
  }
  throw new Error("unreachable");
}


export async function probeXtream(host: string, username: string, password: string): Promise<XtreamResult> {
  const clean = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const auth = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const out: XtreamResult = {
    api_ms: null, login_ok: false, json_valid: false,
    reachable: false, login_checked: false,
    http_status: null, body_snippet: null, diagnostics: null,
    channels: null, movies: null, series: null, categories: null,
    sampleLive: [], sampleVod: [], sampleSeries: [], error: null,
  };

  // 1) URL responde? tenta http e, se falhar, https (mesma ordem de diagnóstico)
  const t0 = Date.now();
  let info: any = null;
  let okDiag: PlayerApiDiagnostics | null = null;
  let b = `http://${clean}`;
  let lastErr: PlayerApiError | null = null;

  for (const candidate of [`http://${clean}`, `https://${clean}`]) {
    try {
      const r = await getJson(`${candidate}/player_api.php?${auth}`);
      info = r.data;
      okDiag = r.diag;
      b = candidate;
      lastErr = null;
      break;
    } catch (e: unknown) {
      lastErr = e instanceof PlayerApiError
        ? e
        : new PlayerApiError({
            url: safeUrl(`${candidate}/player_api.php?${auth}`),
            final_url: null, redirected: false, http_status: null, status_text: null,
            elapsed_ms: 0, content_type: null, size_bytes: null, body_snippet: null,
            stage: "network", message: "❌ Sem resposta do servidor.",
          });
      // Se o servidor respondeu (status HTTP conhecido), não vale tentar outro esquema.
      if (lastErr.status !== null) break;
    }
  }

  out.api_ms = Date.now() - t0;

  if (lastErr || info === null) {
    out.error = lastErr?.message ?? "❌ Sem resposta do servidor.";
    out.http_status = lastErr?.status ?? null;
    out.body_snippet = lastErr?.snippet ?? null;
    out.diagnostics = lastErr?.diag ?? null;
    out.reachable = lastErr?.status != null;
    // Falha de transporte/servidor: login NÃO foi verificado.
    out.login_checked = false;
    return out;
  }

  // 2) JSON válido → só agora avaliamos usuário/senha
  out.reachable = true;
  out.json_valid = true;
  out.http_status = okDiag?.http_status ?? 200;
  out.body_snippet = okDiag?.body_snippet ?? null;
  out.diagnostics = okDiag;
  out.login_checked = typeof info === "object" && info !== null && "user_info" in info;

  if (!out.login_checked) {
    out.error = "❌ Resposta JSON sem 'user_info' — login não pôde ser verificado (URL Xtream incorreta?).";
    return out;
  }

  const status = String(info?.user_info?.status ?? "");
  out.login_ok = String(info?.user_info?.auth ?? "0") === "1" && status !== "Disabled" && status !== "Banned";

  if (!out.login_ok) {
    out.error = status === "Disabled" || status === "Banned"
      ? `❌ Conta Xtream ${status === "Banned" ? "banida" : "desativada"}.`
      : "❌ Usuário ou senha inválidos.";
    return out;
  }


  const [live, vod, series, catsLive, catsVod, catsSeries] = await Promise.allSettled([
    getJson(`${b}/player_api.php?${auth}&action=get_live_streams`, M3U_TIMEOUT_MS),
    getJson(`${b}/player_api.php?${auth}&action=get_vod_streams`, M3U_TIMEOUT_MS),
    getJson(`${b}/player_api.php?${auth}&action=get_series`, M3U_TIMEOUT_MS),
    getJson(`${b}/player_api.php?${auth}&action=get_live_categories`),
    getJson(`${b}/player_api.php?${auth}&action=get_vod_categories`),
    getJson(`${b}/player_api.php?${auth}&action=get_series_categories`),
  ]);

  const arr = (r: PromiseSettledResult<{ data: unknown }>): any[] =>
    r.status === "fulfilled" && Array.isArray(r.value.data) ? (r.value.data as any[]) : [];


  const liveList = arr(live);
  const vodList = arr(vod);
  const seriesList = arr(series);

  out.channels = liveList.length || null;
  out.movies = vodList.length || null;
  out.series = seriesList.length || null;
  const catCount = arr(catsLive).length + arr(catsVod).length + arr(catsSeries).length;
  out.categories = catCount || null;

  const pick = <T,>(list: T[], n: number): T[] => {
    if (list.length <= n) return list;
    const step = Math.floor(list.length / n);
    return Array.from({ length: n }, (_, i) => list[i * step]);
  };

  out.sampleLive = pick(liveList, 3).map((x) => ({ id: x?.stream_id, name: x?.name ?? "" }));
  out.sampleVod = pick(vodList, 2).map((x) => ({ id: x?.stream_id, name: x?.name ?? "", ext: x?.container_extension ?? "mp4" }));
  out.sampleSeries = pick(seriesList, 2).map((x) => ({ id: x?.series_id, name: x?.name ?? "" }));

  return out;
}

/* ------------------------------------------------------------------ */
/* M3U integrity (modo completo)                                       */
/* ------------------------------------------------------------------ */

export async function probeM3U(host: string, username: string, password: string) {
  const b = base(host);
  const url = `${b}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
  try {
    const res = await timedFetch(url, M3U_TIMEOUT_MS);
    if (!res.ok) return { playlist_ok: false, m3u_channels: null, m3u_groups: null, m3u_bytes: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const bytes = text.length;
    const okHeader = /#EXTM3U/i.test(text.slice(0, 512));
    const extinf = text.match(/#EXTINF/gi)?.length ?? 0;
    const urls = text.split("\n").filter((l) => /^https?:\/\//i.test(l.trim())).length;
    const groups = new Set(Array.from(text.matchAll(/group-title="([^"]*)"/gi)).map((m) => m[1]));
    const balanced = extinf > 0 && Math.abs(extinf - urls) <= Math.max(2, extinf * 0.02);
    return {
      playlist_ok: okHeader && balanced,
      m3u_channels: extinf || null,
      m3u_groups: groups.size || null,
      m3u_bytes: bytes,
      error: okHeader ? (balanced ? null : "Playlist inconsistente (EXTINF x URLs)") : "Cabeçalho #EXTM3U ausente",
    };
  } catch (e: unknown) {
    return { playlist_ok: false, m3u_channels: null, m3u_groups: null, m3u_bytes: null, error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

/* ------------------------------------------------------------------ */
/* Stream sampling                                                     */
/* ------------------------------------------------------------------ */

function parseHls(text: string) {
  const stream = /#EXT-X-STREAM-INF:([^\n]*)/i.exec(text)?.[1] ?? "";
  const resolution = /RESOLUTION=(\d+x\d+)/i.exec(stream)?.[1] ?? null;
  const bandwidth = /BANDWIDTH=(\d+)/i.exec(stream)?.[1];
  const codecs = /CODECS="([^"]+)"/i.exec(stream)?.[1] ?? null;
  return {
    resolution,
    bitrate_kbps: bandwidth ? Math.round(Number(bandwidth) / 1000) : null,
    codec: codecs ? prettyCodec(codecs) : null,
  };
}

function prettyCodec(c: string): string {
  const l = c.toLowerCase();
  if (l.includes("hvc1") || l.includes("hev1") || l.includes("hevc")) return "HEVC";
  if (l.includes("avc1") || l.includes("h264")) return "H.264";
  if (l.includes("av01")) return "AV1";
  if (l.includes("mp4v")) return "MPEG-4";
  return c.split(",")[0].toUpperCase();
}

export async function probeStream(kind: StreamProbe["kind"], url: string, label: string | null): Promise<StreamProbe> {
  const t0 = Date.now();
  const out: StreamProbe = {
    kind, label, ok: false, start_ms: null, total_ms: null,
    bitrate_kbps: null, resolution: null, codec: null, buffer_ms: null, error: null,
  };
  try {
    const res = await timedFetch(url, STREAM_TIMEOUT_MS);
    out.start_ms = Date.now() - t0;
    if (!res.ok || !res.body) {
      out.error = `HTTP ${res.status}`;
      out.total_ms = Date.now() - t0;
      return out;
    }
    const ctype = res.headers.get("content-type") ?? "";
    const reader = res.body.getReader();
    let received = 0;
    let firstChunkAt: number | null = null;
    const chunks: Uint8Array[] = [];
    const readStart = Date.now();
    while (received < STREAM_SAMPLE_BYTES && Date.now() - readStart < 4000) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (firstChunkAt === null) firstChunkAt = Date.now();
        received += value.byteLength;
        if (chunks.length < 4) chunks.push(value);
      }
    }
    try { await reader.cancel(); } catch { /* ignore */ }

    out.buffer_ms = firstChunkAt ? firstChunkAt - t0 - (out.start_ms ?? 0) : null;
    const elapsedSec = Math.max(0.15, (Date.now() - readStart) / 1000);

    if (/mpegurl/i.test(ctype) || url.endsWith(".m3u8")) {
      const text = new TextDecoder().decode(chunks[0] ?? new Uint8Array());
      const hls = parseHls(text);
      out.resolution = hls.resolution;
      out.codec = hls.codec;
      out.bitrate_kbps = hls.bitrate_kbps;
      out.ok = /#EXTM3U/i.test(text);
      if (!out.ok) out.error = "Manifesto HLS inválido";
    } else {
      out.bitrate_kbps = received > 0 ? Math.round((received * 8) / elapsedSec / 1000) : null;
      const head = chunks[0];
      // MPEG-TS sync byte 0x47 -> transport stream válido
      if (head && head[0] === 0x47) out.codec = "H.264/TS";
      out.ok = received > 20_000;
      if (!out.ok) out.error = "Stream não iniciou (poucos bytes)";
    }
    out.total_ms = Date.now() - t0;
    return out;
  } catch (e: unknown) {
    out.total_ms = Date.now() - t0;
    out.error = String((e as Error)?.message ?? e).slice(0, 200);
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Health score                                                        */
/* ------------------------------------------------------------------ */

export function computeHealthScore(input: {
  uptimePct: number | null;       // 0..100
  latencyMs: number | null;
  apiMs: number | null;
  streamStartMs: number | null;
  instability24h: number | null;  // 0..1 (fração de checks não-up)
  ipChanges7d: number;
}): number {
  const scale = (v: number | null, good: number, bad: number) => {
    if (v == null) return 0.7;
    if (v <= good) return 1;
    if (v >= bad) return 0;
    return 1 - (v - good) / (bad - good);
  };
  const uptime = input.uptimePct == null ? 0.7 : Math.max(0, Math.min(1, input.uptimePct / 100));
  const latency = scale(input.latencyMs, 120, 1500);
  const api = scale(input.apiMs, 400, 5000);
  const stream = scale(input.streamStartMs, 1200, 8000);
  const stability = input.instability24h == null ? 0.7 : Math.max(0, 1 - input.instability24h * 3);
  const ip = input.ipChanges7d === 0 ? 1 : input.ipChanges7d === 1 ? 0.6 : 0.2;

  const score = uptime * 30 + latency * 20 + api * 15 + stream * 20 + stability * 10 + ip * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function healthLabel(score: number): { label: string; tone: "success" | "warning" | "destructive" } {
  if (score >= 95) return { label: "Excelente", tone: "success" };
  if (score >= 85) return { label: "Muito Bom", tone: "success" };
  if (score >= 70) return { label: "Bom", tone: "success" };
  if (score >= 50) return { label: "Atenção", tone: "warning" };
  return { label: "Crítico", tone: "destructive" };
}

/* ------------------------------------------------------------------ */
/* Sync orchestration                                                  */
/* ------------------------------------------------------------------ */

async function raiseAlert(serverId: string, kind: string, severity: string, title: string, detail?: string) {
  await supabaseAdmin.from("iptv_alerts").insert({ server_id: serverId, kind, severity, title, detail: detail ?? null });
  try {
    const { notifyServerIptvAlert } = await import("./iptv-notify.server");
    await notifyServerIptvAlert(serverId, title, detail ?? "");
  } catch { /* notificação é best-effort */ }
}

export async function runIptvSync(serverId: string, opts: { mode?: "smart" | "full"; force?: boolean } = {}) {
  const { data: srv } = await supabaseAdmin.from("servers").select("*").eq("id", serverId).maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");
  const server = srv as unknown as ServerRow;
  const mode = opts.mode ?? (server.iptv_mode === "basic" ? "smart" : server.iptv_mode);

  if (!opts.force && server.last_iptv_sync_at && Date.now() - new Date(server.last_iptv_sync_at).getTime() < MIN_GAP_MS) {
    return { skipped: true, reason: "rate-limit" as const };
  }

  const username = server.iptv_username ?? "";
  const password = server.iptv_password ?? "";
  if (!username || !password) throw new Error("Configure usuário e senha do Xtream para o modo inteligente.");

  // Detecção automática (barata) quando ainda desconhecida
  let detected = server.iptv_detected;
  if (detected === "none") {
    detected = (await detectIptvKind(server.host, username, password)).kind;
    await supabaseAdmin.from("servers").update({ iptv_detected: detected }).eq("id", serverId);
  }

  const x = await probeXtream(server.host, username, password);

  let m3u: Awaited<ReturnType<typeof probeM3U>> | null = null;
  if (mode === "full" && (detected === "m3u" || detected === "both")) {
    m3u = await probeM3U(server.host, username, password);
  }

  // Amostragem de streams (sequencial, no máximo 3 requisições)
  const streamProbes: StreamProbe[] = [];
  if (server.iptv_stream_tests && x.login_ok) {
    const b = base(server.host);
    const cred = `${encodeURIComponent(username)}/${encodeURIComponent(password)}`;
    const live = x.sampleLive[0];
    const vod = x.sampleVod[0];
    if (live?.id != null) streamProbes.push(await probeStream("live", `${b}/${cred}/${live.id}`, live.name));
    if (vod?.id != null) streamProbes.push(await probeStream("vod", `${b}/movie/${cred}/${vod.id}.${vod.ext || "mp4"}`, vod.name));
    const serie = x.sampleSeries[0];
    if (serie?.id != null && mode === "full") {
      streamProbes.push(await probeStream("series", `${b}/series/${cred}/${serie.id}.mp4`, serie.name));
    }
  }

  // Contexto de rede/uptime
  const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: checks24 } = await supabaseAdmin
    .from("checks").select("status, latency_ms").eq("server_id", serverId).gte("checked_at", since24).limit(1000);
  const total = checks24?.length ?? 0;
  const ups = (checks24 ?? []).filter((c) => c.status === "up").length;
  const uptimePct = total ? (ups / total) * 100 : null;
  const instability = total ? (total - ups) / total : null;

  const { data: regionStats } = await supabaseAdmin
    .from("region_checks").select("region_code, latency_ms").eq("server_id", serverId)
    .gte("checked_at", new Date(Date.now() - 3600_000).toISOString()).limit(500);
  const byRegion = new Map<string, number[]>();
  for (const r of regionStats ?? []) {
    if (r.latency_ms == null) continue;
    byRegion.set(r.region_code, [...(byRegion.get(r.region_code) ?? []), r.latency_ms]);
  }
  const avgs = Array.from(byRegion.entries()).map(([code, arr]) => ({ code, avg: arr.reduce((a, b) => a + b, 0) / arr.length }));
  avgs.sort((a, b) => a.avg - b.avg);
  const fastest = avgs[0]?.code ?? null;
  const slowest = avgs[avgs.length - 1]?.code ?? null;
  const avgGlobal = avgs.length ? Math.round(avgs.reduce((a, b) => a + b.avg, 0) / avgs.length) : null;

  // DNS intelligence
  const { data: analysis } = await supabaseAdmin
    .from("server_analysis").select("ipv4, asn, org, country, city").eq("server_id", serverId).maybeSingle();
  const currentIp = (analysis?.ipv4 as string[] | null)?.[0] ?? null;
  const currentAsn = analysis?.asn ?? null;

  const { data: lastSync } = await supabaseAdmin
    .from("iptv_syncs").select("*").eq("server_id", serverId).order("synced_at", { ascending: false }).limit(1).maybeSingle();

  if (lastSync?.ip && currentIp && lastSync.ip !== currentIp) {
    await supabaseAdmin.from("iptv_ip_history").insert({
      server_id: serverId, old_ip: lastSync.ip, new_ip: currentIp,
      old_asn: lastSync.asn, new_asn: currentAsn, datacenter: analysis?.org ?? null,
      country: analysis?.country ?? null, city: analysis?.city ?? null,
    });
    await raiseAlert(serverId, "ip_change", "warning", `⚠ DNS mudou de IP`, `${lastSync.ip} → ${currentIp}`);
  }
  if (lastSync?.asn && currentAsn && lastSync.asn !== currentAsn) {
    await raiseAlert(serverId, "asn_change", "warning", "⚠ Mudança de ASN/Datacenter", `${lastSync.asn} → ${currentAsn}`);
  }

  const { count: ipChanges7d } = await supabaseAdmin
    .from("iptv_ip_history").select("id", { count: "exact", head: true })
    .eq("server_id", serverId).gte("changed_at", new Date(Date.now() - 7 * 864e5).toISOString());

  const streamStart = streamProbes.length
    ? Math.round(streamProbes.reduce((a, s) => a + (s.start_ms ?? 0), 0) / streamProbes.length)
    : null;

  const health = computeHealthScore({
    uptimePct,
    latencyMs: server.last_latency_ms,
    apiMs: x.api_ms,
    streamStartMs: streamStart,
    instability24h: instability,
    ipChanges7d: ipChanges7d ?? 0,
  });

  const { data: sync } = await supabaseAdmin.from("iptv_syncs").insert({
    server_id: serverId,
    mode,
    api_ms: x.api_ms,
    login_ok: x.login_ok,
    json_valid: x.json_valid,
    channels: x.channels,
    movies: x.movies,
    series: x.series,
    categories: x.categories,
    m3u_channels: m3u?.m3u_channels ?? null,
    m3u_groups: m3u?.m3u_groups ?? null,
    m3u_bytes: m3u?.m3u_bytes ?? null,
    playlist_ok: m3u?.playlist_ok ?? null,
    latency_ms: server.last_latency_ms,
    health_score: health,
    fastest_region: fastest,
    slowest_region: slowest,
    avg_region_ms: avgGlobal,
    ip: currentIp,
    asn: currentAsn,
    datacenter: analysis?.org ?? null,
    error: x.error ?? m3u?.error ?? null,
  }).select("id").maybeSingle();

  if (sync?.id && streamProbes.length) {
    await supabaseAdmin.from("iptv_stream_tests").insert(
      streamProbes.map((s) => ({ server_id: serverId, sync_id: sync.id, ...s })),
    );
  }

  await supabaseAdmin.from("servers")
    .update({ health_score: health, last_iptv_sync_at: new Date().toISOString() })
    .eq("id", serverId);

  /* ---- Alertas inteligentes ---- */
  const drop = (prev: number | null | undefined, curr: number | null, label: string, kind: string) => {
    if (!prev || !curr) return null;
    const diff = prev - curr;
    if (diff > Math.max(5, prev * 0.02)) {
      return raiseAlert(serverId, kind, diff > prev * 0.1 ? "critical" : "warning",
        `⚠ Servidor perdeu ${diff.toLocaleString("pt-BR")} ${label}`,
        `${prev.toLocaleString("pt-BR")} → ${curr.toLocaleString("pt-BR")}`);
    }
    return null;
  };

  await Promise.allSettled([
    drop(lastSync?.channels, x.channels, "canais", "channels_drop"),
    drop(lastSync?.movies, x.movies, "filmes", "movies_drop"),
    drop(lastSync?.series, x.series, "séries", "series_drop"),
    drop(lastSync?.categories, x.categories, "categorias", "categories_drop"),
    x.login_checked && !x.login_ok ? raiseAlert(serverId, "login_invalid", "critical", "🚨 Login do Xtream inválido", x.error ?? undefined) : null,
    x.api_ms && x.api_ms > 5000 ? raiseAlert(serverId, "api_slow", "warning", "⚠ Player API lenta", `${x.api_ms}ms`) : null,
    !x.json_valid ? raiseAlert(serverId, "api_down", "critical", "🚨 Player API indisponível", x.error ?? undefined) : null,
    m3u && m3u.playlist_ok === false ? raiseAlert(serverId, "playlist_broken", "warning", "⚠ Playlist M3U com problema", m3u.error ?? undefined) : null,
    streamProbes.some((s) => !s.ok) ? raiseAlert(serverId, "stream_offline", "warning", "⚠ Streams de amostra offline",
      streamProbes.filter((s) => !s.ok).map((s) => `${s.kind}: ${s.error ?? "falhou"}`).join(" · ")) : null,
    health < 70 && (lastSync?.health_score ?? 100) >= 70
      ? raiseAlert(serverId, "health_drop", "critical", "🚨 Seu servidor perdeu desempenho",
          `Detectamos degradação antes da queda. Health Score: ${health}%`)
      : null,
  ].filter(Boolean) as Promise<unknown>[]);

  return { skipped: false as const, sync_id: sync?.id ?? null, health, channels: x.channels, streams: streamProbes };
}

export async function runDueIptvSyncs() {
  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select("id, owner_id, iptv_mode, iptv_interval_minutes, last_iptv_sync_at, iptv_username, iptv_password")
    .neq("iptv_mode", "basic");
  if (!servers?.length) return { synced: 0, errors: 0 };

  const ownerIds = Array.from(new Set(servers.map((s) => s.owner_id)));
  const { data: subs } = await supabaseAdmin
    .from("subscriptions").select("user_id, status, expires_at").in("user_id", ownerIds);
  const nowIso = new Date().toISOString();
  const active = new Set((subs ?? []).filter((s) => (s.status === "active" || s.status === "trial") && s.expires_at > nowIso).map((s) => s.user_id));

  const due = servers.filter((s) => {
    if (!active.has(s.owner_id)) return false;
    if (!s.iptv_username || !s.iptv_password) return false;
    if (!s.last_iptv_sync_at) return true;
    return Date.now() - new Date(s.last_iptv_sync_at).getTime() >= s.iptv_interval_minutes * 60_000;
  }).slice(0, 10); // fila: no máximo 10 servidores por execução

  let synced = 0, errors = 0;
  for (const s of due) {
    try { await runIptvSync(s.id, { mode: "smart" }); synced++; }
    catch { errors++; }
  }
  return { synced, errors };
}
