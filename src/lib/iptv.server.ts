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

/** User-Agents usados nos testes (padrão = player IPTV real; alternativo = navegador). */
export const UA_PLAYER =
  "IPTVSmartersPlayer/3.1.5 (Linux; Android 11) ExoPlayerLib/2.18.1";
export const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function playerHeaders(ua: string): Record<string, string> {
  return {
    "user-agent": ua,
    accept: "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  };
}

/** IP de saída do monitor (cacheado por 10 min) — útil para diagnosticar bloqueio por IP. */
let _egress: { ip: string | null; at: number } = { ip: null, at: 0 };
export async function egressIp(): Promise<string | null> {
  if (_egress.ip && Date.now() - _egress.at < 600_000) return _egress.ip;
  for (const url of ["https://api.ipify.org?format=json", "https://ifconfig.me/all.json"]) {
    try {
      const res = await timedFetch(url, 5000);
      const j: any = await res.json();
      const ip = j?.ip ?? j?.ip_addr ?? null;
      if (ip) {
        _egress = { ip: String(ip), at: Date.now() };
        return _egress.ip;
      }
    } catch {
      /* ignora */
    }
  }
  return null;
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
  const clean = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const u = username ?? "test";
  const p = password ?? "test";
  const auth = `username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`;
  let xtream = false;
  let m3u = false;
  const details: Record<string, unknown> = {};

  // 1) Fonte de verdade: Player API (Xtream). Tenta http e https.
  for (const candidate of [`http://${clean}`, `https://${clean}`]) {
    try {
      const { data, diag } = await getJson(`${candidate}/player_api.php?${auth}`);
      details.player_api_status = diag.http_status;
      details.player_api_base = candidate;
      const info = data as any;
      if (info && typeof info === "object" && "user_info" in info) {
        xtream = true;
        details.auth = info?.user_info?.auth ?? null;
        details.status = info?.user_info?.status ?? null;
      }
      break;
    } catch (e: unknown) {
      const err = e as PlayerApiError;
      details.player_api_status = err?.status ?? null;
      details.player_api_error = String(err?.message ?? e).slice(0, 160);
      if (err?.status != null) break; // servidor respondeu: não tentar outro esquema
    }
  }

  // 2) get.php é apenas teste de playlist M3U — NUNCA define validade do login.
  try {
    const res = await timedFetch(
      `http://${clean}/get.php?${auth}&type=m3u_plus&output=ts`,
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
  user_agent: string | null;
  request_headers: Record<string, string> | null;
  response_headers: Record<string, string> | null;
  egress_ip: string | null;
  stage: "network" | "http" | "empty" | "content-type" | "parse" | "ok";
  message: string;
};


export type XtreamAccount = {
  status: string | null;
  is_trial: boolean | null;
  exp_date: string | null; // ISO ou null (conta sem expiração)
  days_to_expire: number | null;
  max_connections: number | null;
  active_connections: number | null;
  created_at: string | null;
  timezone: string | null;
  server_url: string | null;
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
  account: XtreamAccount | null;
  content: { live_ok: boolean; vod_ok: boolean; series_ok: boolean };
  channels: number | null;
  movies: number | null;
  series: number | null;
  categories: number | null;
  sampleLive: { id: string | number; name: string }[];
  sampleVod: { id: string | number; name: string; ext: string }[];
  sampleSeries: { id: string | number; name: string }[];
  /** Metadados completos do catálogo (sem vídeo) para a Inteligência de Conteúdo. */
  catalog: {
    live: { id: string; name: string; category?: string | null }[];
    vod: { id: string; name: string; category?: string | null }[];
    series: { id: string; name: string; category?: string | null }[];
  };
  error: string | null;
};


/** Remove credenciais da URL antes de registrar em logs. */
function safeUrl(url: string) {
  return url.replace(/(username|password)=[^&]*/gi, "$1=***");
}

/** Remove credenciais do corpo retornado (o Xtream ecoa usuário/senha em user_info). */
export function redactSnippet(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/("(?:username|password|auth_?token|token)"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/(username|password)=[^&"\s]*/gi, "$1=***");
}

/**
 * Versão do diagnóstico segura para persistir: sem corpo da resposta e sem
 * headers. Guardamos apenas status, tempo, tamanho, estágio e mensagem.
 */
export function sanitizeDiagnostics(
  diag: PlayerApiDiagnostics | null | undefined,
): Omit<PlayerApiDiagnostics, "body_snippet" | "request_headers" | "response_headers"> | null {
  if (!diag) return null;
  const { body_snippet: _b, request_headers: _q, response_headers: _r, ...rest } = diag;
  return rest;
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
  ua: string = UA_PLAYER,
): Promise<{ data: unknown; diag: PlayerApiDiagnostics }> {
  const t0 = Date.now();
  const masked = safeUrl(url);
  const reqHeaders = playerHeaders(ua);
  const outIp = await egressIp();
  let res: Response;
  try {
    res = await timedFetch(url, ms, { headers: reqHeaders });
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
      user_agent: ua,
      request_headers: reqHeaders,
      response_headers: null,
      egress_ip: outIp,
      stage: "network",
      message: aborted
        ? "❌ Sem resposta: tempo limite excedido ao conectar no servidor."
        : `❌ Sem resposta do servidor (${String((e as Error)?.message ?? e).slice(0, 120)}).`,
    };
    console.warn("[iptv] player_api falhou", sanitizeDiagnostics(diag));
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
    body_snippet: redactSnippet(text.slice(0, 500)),
    user_agent: ua,
    request_headers: reqHeaders,
    response_headers: headers,
    egress_ip: outIp,
    stage: "ok",
    message: "",
  };

  const fail = (stage: PlayerApiDiagnostics["stage"], message: string): never => {
    diag.stage = stage;
    diag.message = message;
    console.warn("[iptv] player_api", sanitizeDiagnostics(diag));
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
    account: null, content: { live_ok: false, vod_ok: false, series_ok: false },
    channels: null, movies: null, series: null, categories: null,
    sampleLive: [], sampleVod: [], sampleSeries: [],
    catalog: { live: [], vod: [], series: [] },
    error: null,
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
            user_agent: UA_PLAYER, request_headers: null, response_headers: null, egress_ip: null,
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

  // 3) Autenticação + informações da conta (status, expiração, conexões)
  const ui = info.user_info ?? {};
  const status = String(ui.status ?? "");
  const expTs = Number(ui.exp_date);
  const expIso = Number.isFinite(expTs) && expTs > 0 ? new Date(expTs * 1000).toISOString() : null;
  const createdTs = Number(ui.created_at);
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

  out.account = {
    status: status || null,
    is_trial: ui.is_trial == null ? null : String(ui.is_trial) === "1",
    exp_date: expIso,
    days_to_expire: expIso ? Math.ceil((new Date(expIso).getTime() - Date.now()) / 864e5) : null,
    max_connections: num(ui.max_connections),
    active_connections: num(ui.active_cons),
    created_at: Number.isFinite(createdTs) && createdTs > 0 ? new Date(createdTs * 1000).toISOString() : null,
    timezone: info?.server_info?.timezone ?? null,
    server_url: info?.server_info?.url
      ? `${info.server_info.url}${info.server_info.port ? `:${info.server_info.port}` : ""}`
      : null,
  };

  const expired = expIso != null && new Date(expIso).getTime() <= Date.now();
  out.login_ok =
    String(ui.auth ?? "0") === "1" && status !== "Disabled" && status !== "Banned" && !expired;

  if (!out.login_ok) {
    out.error =
      status === "Disabled" || status === "Banned"
        ? `❌ Conta Xtream ${status === "Banned" ? "banida" : "desativada"}.`
        : expired
          ? `❌ Conta Xtream expirada em ${new Date(expIso!).toLocaleString("pt-BR")}.`
          : "❌ Usuário ou senha inválidos.";
    return out;
  }

  // 4) Somente após login válido: testar conteúdos (Live, VOD, Séries)
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

  out.content = {
    live_ok: live.status === "fulfilled" && liveList.length > 0,
    vod_ok: vod.status === "fulfilled" && vodList.length > 0,
    series_ok: series.status === "fulfilled" && seriesList.length > 0,
  };

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

  // Catálogo (apenas metadados) para a Inteligência de Conteúdo.
  const entry = (id: unknown, name: unknown, cat: unknown) => ({
    id: String(id ?? ""),
    name: String(name ?? "").trim(),
    category: cat == null ? null : String(cat),
  });
  out.catalog = {
    live: liveList.map((x) => entry(x?.stream_id, x?.name, x?.category_id)),
    vod: vodList.map((x) => entry(x?.stream_id, x?.name, x?.category_id)),
    series: seriesList.map((x) => entry(x?.series_id, x?.name, x?.category_id)),
  };

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
  liveOk?: boolean | null;
  vodOk?: boolean | null;
  seriesOk?: boolean | null;
}): number {
  const scale = (v: number | null, good: number, bad: number) => {
    if (v == null) return 0.7;
    if (v <= good) return 1;
    if (v >= bad) return 0;
    return 1 - (v - good) / (bad - good);
  };
  const flag = (v: boolean | null | undefined) => (v == null ? 0.7 : v ? 1 : 0);

  const uptimeBase = input.uptimePct == null ? 0.7 : Math.max(0, Math.min(1, input.uptimePct / 100));
  const stability = input.instability24h == null ? 0.7 : Math.max(0, 1 - input.instability24h * 3);
  const uptime = uptimeBase * 0.7 + stability * 0.3;
  const response = scale(input.latencyMs, 120, 1500) * 0.6 + scale(input.streamStartMs, 1200, 8000) * 0.4;
  const api = scale(input.apiMs, 400, 5000);
  const ip = input.ipChanges7d === 0 ? 1 : input.ipChanges7d === 1 ? 0.6 : 0.2;

  // Uptime 30 · Player API 15 · Tempo de resposta 15 · Live 20 · VOD 10 · Séries 5 · IP/DNS 5
  const score =
    uptime * 30 +
    api * 15 +
    response * 15 +
    flag(input.liveOk) * 20 +
    flag(input.vodOk) * 10 +
    flag(input.seriesOk) * 5 +
    ip * 5;
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

import type { AlertCandidate } from "./alert-state.server";


export async function runIptvSync(serverId: string, opts: { mode?: "smart" | "full"; force?: boolean } = {}) {
  const { data: srv } = await supabaseAdmin.from("servers").select("*").eq("id", serverId).maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");
  const server = srv as unknown as ServerRow;
  const mode = opts.mode ?? (server.iptv_mode === "basic" ? "smart" : server.iptv_mode);

  // Todos os problemas detectados nesta execução são acumulados e enviados
  // em UMA única mensagem consolidada no final (ver dispatchAlerts).
  const alerts: AlertCandidate[] = [];
  const pushAlert = (c: AlertCandidate) => { alerts.push(c); };


  if (!opts.force && server.last_iptv_sync_at && Date.now() - new Date(server.last_iptv_sync_at).getTime() < MIN_GAP_MS) {
    return { skipped: true, reason: "rate-limit" as const };
  }

  const { getIptvCredentials, checkLoginGuard, guardMessage, registerLoginResult } = await import(
    "./iptv-credentials.server"
  );
  const cred0 = await getIptvCredentials(serverId);
  const username = cred0.username ?? "";
  const password = cred0.password ?? "";
  if (!username || !password) throw new Error("Configure usuário e senha do Xtream para o modo inteligente.");

  const guard = await checkLoginGuard(serverId);
  if (!guard.allowed) throw new Error(guardMessage(guard));

  // Detecção automática (barata) quando ainda desconhecida
  let detected = server.iptv_detected;
  if (detected === "none") {
    detected = (await detectIptvKind(server.host, username, password)).kind;
    await supabaseAdmin.from("servers").update({ iptv_detected: detected }).eq("id", serverId);
  }

  const x = await probeXtream(server.host, username, password);

  // Contabiliza tentativas apenas quando o login foi de fato verificado
  // (falhas de rede/servidor não contam como senha errada).
  if (x.login_checked) await registerLoginResult(serverId, x.login_ok, x.error);

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
    pushAlert({ kind: "ip_change", severity: "warning", title: "⚠ DNS mudou de IP", detail: `${lastSync.ip} → ${currentIp}`, transient: true });
  }
  if (lastSync?.asn && currentAsn && lastSync.asn !== currentAsn) {
    pushAlert({ kind: "asn_change", severity: "warning", title: "⚠ Mudança de ASN/Datacenter", detail: `${lastSync.asn} → ${currentAsn}`, transient: true });

  }

  const { count: ipChanges7d } = await supabaseAdmin
    .from("iptv_ip_history").select("id", { count: "exact", head: true })
    .eq("server_id", serverId).gte("changed_at", new Date(Date.now() - 7 * 864e5).toISOString());

  const streamStart = streamProbes.length
    ? Math.round(streamProbes.reduce((a, s) => a + (s.start_ms ?? 0), 0) / streamProbes.length)
    : null;

  const probeOk = (kind: "live" | "vod" | "series") => {
    const p = streamProbes.find((s) => s.kind === kind);
    return p ? p.ok : null;
  };
  const health = computeHealthScore({
    uptimePct,
    latencyMs: server.last_latency_ms,
    apiMs: x.api_ms,
    streamStartMs: streamStart,
    instability24h: instability,
    ipChanges7d: ipChanges7d ?? 0,
    liveOk: x.login_ok ? (probeOk("live") ?? x.content.live_ok) : false,
    vodOk: x.login_ok ? (probeOk("vod") ?? x.content.vod_ok) : false,
    seriesOk: x.login_ok ? (probeOk("series") ?? x.content.series_ok) : false,
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
    // Erro da Player API tem prioridade; falha do get.php é só de playlist.
    error: x.error ?? (m3u?.error ? `Playlist M3U: ${m3u.error}` : null),

    login_checked: x.login_checked,
    diagnostics: sanitizeDiagnostics(x.diagnostics) as never,

  }).select("id").maybeSingle();

  if (sync?.id && streamProbes.length) {
    await supabaseAdmin.from("iptv_stream_tests").insert(
      streamProbes.map((s) => ({ server_id: serverId, sync_id: sync.id, ...s })),
    );
  }

  await supabaseAdmin.from("servers")
    .update({ health_score: health, last_iptv_sync_at: new Date().toISOString() })
    .eq("id", serverId);

  /* ---- Inteligência de Conteúdo: catálogo, novidades e histórico ---- */
  let catalogDiff: Awaited<ReturnType<typeof import("./iptv-catalog.server").syncCatalog>> | null = null;
  if (x.login_ok && x.catalog.live.length + x.catalog.vod.length + x.catalog.series.length > 0) {
    try {
      const { syncCatalog } = await import("./iptv-catalog.server");
      catalogDiff = await syncCatalog(serverId, x.catalog);
      if (catalogDiff && !catalogDiff.skipped) {
        const parts: string[] = [];
        if (catalogDiff.added.vod) parts.push(`🎬 +${catalogDiff.added.vod} filmes`);
        if (catalogDiff.added.series) parts.push(`📚 +${catalogDiff.added.series} séries`);
        if (catalogDiff.added.live) parts.push(`📺 +${catalogDiff.added.live} canais`);
        if (parts.length) {
          await raiseAlert(serverId, "catalog_added", "info", "🎬 Novos conteúdos no catálogo", parts.join(" · "));
        }

        if (catalogDiff.removed > 0) {
          await raiseAlert(
            serverId,
            "catalog_removed",
            catalogDiff.removed > 50 ? "warning" : "info",
            `📉 ${catalogDiff.removed} conteúdo(s) removido(s) do catálogo`,
            `Total atual: ${catalogDiff.totals.live} canais · ${catalogDiff.totals.vod} filmes · ${catalogDiff.totals.series} séries`,
          );
        }
      }
    } catch (e) {
      console.warn("[iptv] falha ao sincronizar catálogo:", (e as Error)?.message);
    }
  }



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
    // get.php é apenas playlist: nunca gera alerta de login inválido.
    m3u && m3u.playlist_ok === false ? raiseAlert(serverId, "playlist_broken", "warning", "⚠ Playlist M3U com problema", m3u.error ?? undefined) : null,
    x.account?.days_to_expire != null && x.account.days_to_expire <= 7 && x.account.days_to_expire >= 0
      ? raiseAlert(serverId, "account_expiring", "warning", "⚠ Conta Xtream perto do vencimento",
          `Expira em ${x.account.days_to_expire} dia(s) — ${new Date(x.account.exp_date!).toLocaleString("pt-BR")}`)
      : null,
    x.account?.max_connections != null && x.account.active_connections != null && x.account.max_connections > 0 &&
    x.account.active_connections >= x.account.max_connections
      ? raiseAlert(serverId, "connections_limit", "warning", "⚠ Limite de conexões atingido",
          `${x.account.active_connections}/${x.account.max_connections} conexões ativas`)
      : null,
    x.login_ok && !x.content.live_ok
      ? raiseAlert(serverId, "content_live_empty", "warning", "⚠ Nenhum canal ao vivo retornado pela Player API")
      : null,

    streamProbes.some((s) => !s.ok) ? raiseAlert(serverId, "stream_offline", "warning", "⚠ Streams de amostra offline",
      streamProbes.filter((s) => !s.ok).map((s) => `${s.kind}: ${s.error ?? "falhou"}`).join(" · ")) : null,
    health < 70 && (lastSync?.health_score ?? 100) >= 70
      ? raiseAlert(serverId, "health_drop", "critical", "🚨 Seu servidor perdeu desempenho",
          `Detectamos degradação antes da queda. Health Score: ${health}%`)
      : null,
  ].filter(Boolean) as Promise<unknown>[]);

  return { skipped: false as const, sync_id: sync?.id ?? null, health, channels: x.channels, streams: streamProbes, catalog: catalogDiff };
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

/* ------------------------------------------------------------------ */
/* Teste comparativo de User-Agent (diagnóstico de bloqueio 403)       */
/* ------------------------------------------------------------------ */

export type UaProbe = {
  label: string;
  user_agent: string;
  ok: boolean;
  diagnostics: PlayerApiDiagnostics | null;
  error: string | null;
};

/**
 * Chama a Player API com dois User-Agents (player IPTV e navegador) para
 * distinguir bloqueio por identificação da requisição x bloqueio por IP.
 */
export async function comparePlayerApiUserAgents(
  host: string,
  username: string,
  password: string,
): Promise<{ egress_ip: string | null; probes: UaProbe[]; verdict: string }> {
  const clean = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const auth = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const url = `http://${clean}/player_api.php?${auth}`;

  const run = async (label: string, ua: string): Promise<UaProbe> => {
    try {
      const { diag } = await getJson(url, API_TIMEOUT_MS, ua);
      return { label, user_agent: ua, ok: true, diagnostics: diag, error: null };
    } catch (e: unknown) {
      const err = e as PlayerApiError;
      return {
        label,
        user_agent: ua,
        ok: false,
        diagnostics: err?.diag ?? null,
        error: String(err?.message ?? e).slice(0, 240),
      };
    }
  };

  const probes = [
    await run("Player IPTV (padrão)", UA_PLAYER),
    await run("Navegador (Mozilla/5.0)", UA_BROWSER),
  ];

  const [player, browser] = probes;
  let verdict: string;
  if (player!.ok || browser!.ok) {
    verdict = player!.ok && browser!.ok
      ? "✅ Servidor aceita ambos os User-Agents. O bloqueio anterior não é por identificação da requisição."
      : `⚠️ Servidor aceita apenas o User-Agent "${player!.ok ? player!.label : browser!.label}". O bloqueio é por identificação da requisição (User-Agent).`;
  } else if (
    player!.diagnostics?.http_status === 403 &&
    browser!.diagnostics?.http_status === 403
  ) {
    verdict = "🚫 HTTP 403 com os dois User-Agents: bloqueio provavelmente pelo IP de saída do monitor (ou firewall/anti-bot do servidor).";
  } else {
    verdict = "❌ Falha nos dois testes por motivos diferentes — veja os diagnósticos abaixo.";
  }

  return { egress_ip: await egressIp(), probes, verdict };
}
