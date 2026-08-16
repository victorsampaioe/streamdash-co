// Server-only: helpers do Web Player (credenciais da sessão + acesso Xtream).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./crypto.server";

export type PlayerCreds = { username: string | null; password: string | null };

type SessionRow = {
  server_id: string;
  xtream_user: string | null;
  xtream_pass: string | null;
};

/**
 * Credenciais usadas pelo catálogo/stream do Web Player.
 * Prioriza as credenciais do cliente final (login no player) e cai para as
 * credenciais do servidor cadastradas pelo revendedor (sessões antigas).
 */
export async function getPlayerCredentials(session: SessionRow): Promise<PlayerCreds> {
  if (session.xtream_user && session.xtream_pass) {
    return {
      username: session.xtream_user,
      password: await decryptSecret(session.xtream_pass),
    };
  }
  const { getIptvCredentials } = await import("./iptv-credentials.server");
  return await getIptvCredentials(session.server_id);
}

export function buildXtreamCatalogUrl(
  host: string,
  creds: PlayerCreds,
  opts: { action: string; categoryId?: string; contentId?: string; offset?: number; limit?: number }
): string {
  const base = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, "") : `http://${host}`;
  const params = new URLSearchParams({
    username: creds.username ?? "",
    password: creds.password ?? "",
    action: opts.action,
  });
  if (opts.categoryId) params.set("category_id", opts.categoryId);
  if (opts.contentId) {
    if (opts.action === "get_series_info" || opts.action === "get_episodes_list") {
      params.set("series_id", opts.contentId);
    } else {
      params.set("vod_id", opts.contentId);
    }
  }
  return `${base}/player_api.php?${params.toString()}`;
}

/** Remove credenciais de qualquer URL antes de logar. */
export function maskUrl(url: string): string {
  return url.replace(/(username|password)=[^&]*/gi, (_m, k) => `${k}=***`);
}

/** Mantém a resposta de séries consistente, venha ela do Core ou do fallback local. */
export function normalizeSeriesInfoResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const response = value as Record<string, unknown>;
  const rawEpisodes = response.episodes;
  if (rawEpisodes && typeof rawEpisodes === "object" && !Array.isArray(rawEpisodes)) {
    return response;
  }
  return { ...response, episodes: {} };
}

/** Execução local (fallback quando o Core AWS não está configurado). */
export async function fetchXtreamCatalog(
  serverId: string,
  creds: PlayerCreds,
  opts: { action: string; categoryId?: string; contentId?: string; offset?: number; limit?: number }
): Promise<unknown> {
  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("host")
    .eq("id", serverId)
    .maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");

  const { UA_PLAYER } = await import("./iptv.server");

  const runRequest = async (action: string) => {
    const url = buildXtreamCatalogUrl(server.host, creds, { ...opts, action });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const started = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA_PLAYER }, signal: controller.signal });
      const text = await res.text();
      console.log(
        `[CATALOG_DEBUG] fluxo=Painel->IPTV(direto) servidor=${serverId} host=${server.host} usuario=${creds.username} action=${action} endpoint=${maskUrl(url)} status=${res.status} ms=${Date.now() - started} tamanho=${text.length} amostra=${text.slice(0, 200)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${maskUrl(url)}`);
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let json: any = await runRequest(opts.action);

    // Fallback para séries: se get_episodes_list falhar ou for vazio, tenta get_series_info
    if (opts.action === "get_episodes_list" && (!json || (typeof json === "object" && Object.keys(json).length === 0))) {
      console.log(`[CATALOG_DEBUG] fallback get_episodes_list -> get_series_info id=${opts.contentId}`);
      json = await runRequest("get_series_info");
    }

    // Fallback para séries vazias: alguns painéis só respondem em get_series_categories+category_id
    if (opts.action === "get_series" && Array.isArray(json) && json.length === 0 && !opts.categoryId) {
      console.log("[CATALOG_DEBUG] get_series retornou 0 sem categoria — tentando get_series com category_id das categorias");
      try {
        const cats: any = await runRequest("get_series_categories");
        if (Array.isArray(cats) && cats.length > 0) {
          const merged: any[] = [];
          for (const cat of cats.slice(0, 5)) {
            const url = buildXtreamCatalogUrl(server.host, creds, { action: "get_series", categoryId: String(cat.category_id) });
            const res = await fetch(url, { headers: { "user-agent": UA_PLAYER } });
            const text = await res.text();
            try {
              const part = JSON.parse(text);
              if (Array.isArray(part)) merged.push(...part);
            } catch { /* ignore */ }
          }
          console.log(`[CATALOG_DEBUG] get_series por categoria retornou ${merged.length} itens`);
          if (merged.length > 0) json = merged;
        }
      } catch (e) {
        console.warn("[CATALOG_DEBUG] falha no fallback por categoria:", (e as Error)?.message);
      }
    }

    // Normalização para o componente SeriesDetails
    if (opts.action === "get_episodes_list" || opts.action === "get_series_info") {
      json = normalizeSeriesInfoResponse(json);
    }

    // Paginação local se for array
    if (Array.isArray(json) && opts.limit !== undefined) {
      const start = opts.offset || 0;
      const end = start + opts.limit;
      json = json.slice(start, end);
    }
    
    return json;
  } catch (err) {
    console.error(`[CATALOG_DEBUG] ERRO action=${opts.action} servidor=${serverId} erro=${(err as Error)?.message}`);
    throw err;
  }
}

/**
 * ETAPA 3 — testa cada endpoint Xtream diretamente e informa qual retorna dados.
 */
export async function probeXtreamEndpoints(
  serverId: string,
  creds: PlayerCreds,
  seriesId?: string,
): Promise<any> {
  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("host")
    .eq("id", serverId)
    .maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");

  const { UA_PLAYER } = await import("./iptv.server");

  const call = async (action: string, extra?: { categoryId?: string; contentId?: string }) => {
    const url = buildXtreamCatalogUrl(server.host, creds, { action, ...extra });
    const started = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA_PLAYER }, signal: ctl.signal });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* ignore */ }
      const count = Array.isArray(json) ? json.length : json && typeof json === "object" ? Object.keys(json).length : 0;
      const out = {
        action,
        endpoint: maskUrl(url),
        status: res.status,
        ms: Date.now() - started,
        tipo: Array.isArray(json) ? "array" : typeof json,
        quantidade: count,
        amostra: text.slice(0, 240),
        erro: res.ok ? null : `HTTP ${res.status}`,
      };
      console.log(`[CATALOG_DEBUG][probe] ${JSON.stringify({ ...out, amostra: out.amostra.slice(0, 120) })}`);
      return out;
    } catch (e: any) {
      const out = { action, endpoint: maskUrl(url), status: 0, ms: Date.now() - started, tipo: "erro", quantidade: 0, amostra: "", erro: String(e?.message ?? e) };
      console.error(`[CATALOG_DEBUG][probe] ${JSON.stringify(out)}`);
      return out;
    }
  };

  const seriesCats = await call("get_series_categories");
  let firstSeriesCat: string | undefined;
  try {
    const parsed = JSON.parse(seriesCats.amostra.startsWith("[") ? seriesCats.amostra : "[]");
    firstSeriesCat = parsed?.[0]?.category_id != null ? String(parsed[0].category_id) : undefined;
  } catch { /* ignore */ }

  const results = [
    seriesCats,
    await call("get_series"),
    ...(firstSeriesCat ? [await call("get_series", { categoryId: firstSeriesCat })] : []),
    await call("get_vod_categories"),
    await call("get_vod_streams"),
    await call("get_live_categories"),
    await call("get_live_streams"),
  ];

  if (seriesId) {
    results.push(await call("get_series_info", { contentId: seriesId }));
    results.push(await call("get_episodes_list", { contentId: seriesId }));
  }

  const base = /^https?:\/\//i.test(server.host) ? server.host.replace(/\/+$/, "") : `http://${server.host}`;
  const urls = {
    live: `${base}/live/${creds.username}/***/<stream_id>.m3u8`,
    movie: `${base}/movie/${creds.username}/***/<stream_id>.mp4`,
    series: `${base}/series/${creds.username}/***/<episode_id>.mp4`,
  };


  return { host: server.host, usuario: creds.username, resultados: results, urls_de_stream: urls };
}


/* ------------------------------------------------------------------ */
/* Login Xtream (reaproveita a inteligência IPTV + fallback)           */
/* ------------------------------------------------------------------ */

export type XtreamLoginResult = { login_ok: boolean; account: unknown; error: string | null; base: string | null };

/** Bases candidatas para um host cadastrado em qualquer formato. */
export function hostCandidates(host: string): string[] {
  const clean = host.trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(clean)) return [clean, clean.replace(/^https:/i, "http:")];
  if (/^http:\/\//i.test(clean)) return [clean, clean.replace(/^http:/i, "https:")];
  return [`http://${clean}`, `https://${clean}`];
}

/**
 * Valida o login Xtream do cliente final.
 * 1) usa a mesma inteligência já existente (probeXtream: 3 UAs, http/https,
 *    player_api + panel_api);
 * 2) se ela não confirmar, tenta um fallback direto em todas as combinações
 *    de base/rota/User-Agent antes de declarar falha.
 */
export async function validateXtreamLogin(
  host: string,
  username: string,
  password: string,
): Promise<XtreamLoginResult> {
  const { probeXtream, UA_PLAYER, UA_BROWSER, UA_VLC } = await import("./iptv.server");

  let probeError: string | null = null;
  try {
    const probe: any = await probeXtream(host, username, password, { catalogMode: "auth" });
    if (probe?.login_ok) return { login_ok: true, account: probe.account ?? null, error: null, base: null };
    probeError = probe?.error ?? null;
  } catch (e) {
    probeError = String((e as Error)?.message ?? e);
  }

  // Fallback: varre bases (http/https), rotas e User-Agents.
  const auth = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const paths = ["player_api.php", "panel_api.php"];
  const uas = [UA_PLAYER, UA_BROWSER, UA_VLC];
  let lastError = probeError;

  for (const base of hostCandidates(host)) {
    for (const path of paths) {
      for (const ua of uas) {
        const url = `${base}/${path}?${auth}`;
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 12_000);
        try {
          const res = await fetch(url, {
            headers: { "user-agent": ua, accept: "application/json, text/plain, */*" },
            redirect: "follow",
            signal: ctl.signal,
          });
          const text = await res.text();
          if (!res.ok) {
            lastError = `HTTP ${res.status} em ${base}/${path}`;
            continue;
          }
          let json: any = null;
          try { json = JSON.parse(text); } catch { lastError = `Resposta não-JSON em ${base}/${path}`; continue; }
          const ui = json?.user_info ?? json?.user ?? null;
          if (ui && String(ui.auth ?? "1") !== "0" && String(ui.status ?? "Active").toLowerCase() !== "banned") {
            console.log(`[player-login] fallback OK base=${base} path=${path}`);
            return { login_ok: true, account: ui, error: null, base };
          }
          lastError = "Usuário ou senha inválidos.";
        } catch (e) {
          lastError = String((e as Error)?.message ?? e).slice(0, 160);
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }

  return { login_ok: false, account: null, error: lastError ?? "Falha na autenticação Xtream", base: null };
}

/* ------------------------------------------------------------------ */
/* Diagnóstico de REPRODUÇÃO (play real): live / movie / series        */
/* Testa a URL final do Xtream a partir do Painel e, em paralelo,      */
/* pelo Core AWS (URL assinada), comparando status/Range/Content-Type. */
/* ------------------------------------------------------------------ */

export type ProbeResult = Record<string, string | number | boolean | null>;

export type PlaybackProbe = {
  tipo: "live" | "movie" | "series";
  item: string | null;
  content_id: string | null;
  extensao: string;
  url: string | null;
  via_painel: ProbeResult | null;
  via_core: ProbeResult | null;
  reproduzivel_no_navegador: boolean;
  observacao: string | null;
};

const BROWSER_PLAYABLE = new Set(["m3u8", "ts", "mp4", "m4v", "webm"]);

function b64url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function probeMediaUrl(
  url: string,
  opts: { range?: string; ua: string },
): Promise<ProbeResult> {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const headers: Record<string, string> = { "User-Agent": opts.ua, Accept: "*/*" };
    if (opts.range) headers["Range"] = opts.range;
    const res = await fetch(url, { headers, redirect: "follow", signal: ctl.signal });
    const ct = res.headers.get("content-type");
    const isManifest = /mpegurl|m3u/i.test(ct ?? "") || /\.m3u8(\?|$)/i.test(url);
    let amostra: string | null = null;
    if (isManifest) {
      amostra = (await res.text()).slice(0, 300);
    } else {
      const buf = await res.arrayBuffer().catch(() => null);
      amostra = buf ? `${buf.byteLength} bytes recebidos` : null;
    }
    return {
      status: res.status,
      ok: res.ok || res.status === 206,
      ms: Date.now() - started,
      content_type: ct,
      content_length: res.headers.get("content-length"),
      content_range: res.headers.get("content-range"),
      accept_ranges: res.headers.get("accept-ranges"),
      range_suportado: res.status === 206 || !!res.headers.get("content-range"),
      manifesto: isManifest,
      amostra,
      erro: null,
    };
  } catch (e) {
    return { status: 0, ok: false, ms: Date.now() - started, erro: String((e as Error)?.message ?? e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export async function probePlayback(serverId: string, creds: PlayerCreds): Promise<{
  host: string;
  fluxo_atual: string;
  core_configurado: boolean;
  resultados: PlaybackProbe[];
  conclusao: string[];
}> {
  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("host")
    .eq("id", serverId)
    .maybeSingle();
  if (!server) throw new Error("Servidor não encontrado");

  const { UA_PLAYER, UA_VLC } = await import("./iptv.server");
  const { coreApiUrl, isCoreInstance } = await import("./core-api.server");
  const { createHmac } = await import("crypto");

  const base = hostCandidates(server.host)[0]!;
  const user = encodeURIComponent(creds.username ?? "");
  const pass = encodeURIComponent(creds.password ?? "");

  const coreBase = coreApiUrl();
  const secret = process.env["CRON_SECRET"] ?? "";
  const coreDisponivel = !!coreBase && !isCoreInstance() && !!secret;

  const viaCore = async (absUrl: string, tipo: string, ext: string, range?: string) => {
    if (!coreDisponivel) return null;
    const exp = Math.floor(Date.now() / 1000) + 300;
    const sig = createHmac("sha256", secret).update(`${absUrl}|${exp}`).digest("hex");
    const relay = new URL(`${coreBase}/api/public/core/stream`);
    relay.searchParams.set("u", b64url(absUrl));
    relay.searchParams.set("exp", String(exp));
    relay.searchParams.set("sig", sig);
    relay.searchParams.set("type", tipo);
    relay.searchParams.set("ext", ext);
    relay.searchParams.set("via", "core");
    return await probeMediaUrl(relay.toString(), { range, ua: UA_PLAYER });
  };

  const resultados: PlaybackProbe[] = [];

  // ---------- LIVE ----------
  try {
    const live: any = await fetchXtreamCatalog(serverId, creds, { action: "get_live_streams", limit: 1 });
    const ch = Array.isArray(live) ? live[0] : null;
    if (ch) {
      const id = String(ch.stream_id);
      const url = `${base}/live/${user}/${pass}/${id}.m3u8`;
      const painel = await probeMediaUrl(url, { ua: UA_PLAYER });
      resultados.push({
        tipo: "live",
        item: ch.name ?? null,
        content_id: id,
        extensao: "m3u8",
        url: maskUrl(url).replace(`/${user}/${pass}/`, "/***/***/"),
        via_painel: painel,
        via_core: await viaCore(url, "live", "m3u8"),
        reproduzivel_no_navegador: true,
        observacao: painel["manifesto"] ? "Manifesto HLS válido" : "Resposta não é um manifesto HLS",
      });
    }
  } catch (e) {
    resultados.push({ tipo: "live", item: null, content_id: null, extensao: "m3u8", url: null, via_painel: { erro: String((e as Error).message) }, via_core: null, reproduzivel_no_navegador: false, observacao: "Falha ao listar canais" });
  }

  // ---------- MOVIE ----------
  try {
    const vod: any = await fetchXtreamCatalog(serverId, creds, { action: "get_vod_streams", limit: 1 });
    const mv = Array.isArray(vod) ? vod[0] : null;
    if (mv) {
      const id = String(mv.stream_id);
      const ext = String(mv.container_extension || "mp4").toLowerCase();
      const url = `${base}/movie/${user}/${pass}/${id}.${ext}`;
      const painel = await probeMediaUrl(url, { range: "bytes=0-1023", ua: UA_VLC });
      resultados.push({
        tipo: "movie",
        item: mv.name ?? null,
        content_id: id,
        extensao: ext,
        url: `${base}/movie/***/***/${id}.${ext}`,
        via_painel: painel,
        via_core: await viaCore(url, "movie", ext, "bytes=0-1023"),
        reproduzivel_no_navegador: BROWSER_PLAYABLE.has(ext),
        observacao: BROWSER_PLAYABLE.has(ext)
          ? null
          : `Container .${ext} não é suportado nativamente pelo navegador (tela preta mesmo com HTTP 200/206).`,
      });
    }
  } catch (e) {
    resultados.push({ tipo: "movie", item: null, content_id: null, extensao: "mp4", url: null, via_painel: { erro: String((e as Error).message) }, via_core: null, reproduzivel_no_navegador: false, observacao: "Falha ao listar filmes" });
  }

  // ---------- SERIES ----------
  try {
    const series: any = await fetchXtreamCatalog(serverId, creds, { action: "get_series", limit: 1 });
    const sr = Array.isArray(series) ? series[0] : null;
    if (sr) {
      const info: any = await fetchXtreamCatalog(serverId, creds, {
        action: "get_episodes_list",
        contentId: String(sr.series_id),
      });
      const seasons = info?.episodes ?? {};
      const firstSeason = Object.keys(seasons)[0];
      const ep = firstSeason ? seasons[firstSeason]?.[0] : null;
      if (ep) {
        const id = String(ep.id ?? ep.stream_id);
        const ext = String(ep.container_extension || "mp4").toLowerCase();
        const url = `${base}/series/${user}/${pass}/${id}.${ext}`;
        const painel = await probeMediaUrl(url, { range: "bytes=0-1023", ua: UA_VLC });
        resultados.push({
          tipo: "series",
          item: `${sr.name} — ${ep.title ?? `EP ${id}`}`,
          content_id: id,
          extensao: ext,
          url: `${base}/series/***/***/${id}.${ext}`,
          via_painel: painel,
          via_core: await viaCore(url, "series", ext, "bytes=0-1023"),
          reproduzivel_no_navegador: BROWSER_PLAYABLE.has(ext),
          observacao: BROWSER_PLAYABLE.has(ext)
            ? null
            : `Container .${ext} não é suportado nativamente pelo navegador.`,
        });
      }
    }
  } catch (e) {
    resultados.push({ tipo: "series", item: null, content_id: null, extensao: "mp4", url: null, via_painel: { erro: String((e as Error).message) }, via_core: null, reproduzivel_no_navegador: false, observacao: "Falha ao listar séries/episódios" });
  }

  // ---------- CONCLUSÃO ----------
  const conclusao: string[] = [];
  for (const r of resultados) {
    const p: any = r.via_painel ?? {};
    const c: any = r.via_core ?? null;
    if (p.ok && !r.reproduzivel_no_navegador) {
      conclusao.push(`${r.tipo.toUpperCase()}: stream OK (HTTP ${p.status}) mas container .${r.extensao} não roda no navegador — precisa de remux/transcode.`);
    } else if (p.ok) {
      conclusao.push(`${r.tipo.toUpperCase()}: reprodução viável pelo Painel (HTTP ${p.status}${p.range_suportado ? ", Range OK" : ", sem Range"}).`);
    } else if (c?.ok) {
      conclusao.push(`${r.tipo.toUpperCase()}: bloqueado no Painel (${p.status || p.erro}) e OK pelo Core AWS — usar sempre o relay do Core.`);
    } else {
      conclusao.push(`${r.tipo.toUpperCase()}: falhou nos dois caminhos (Painel=${p.status || p.erro}, Core=${c ? c.status || c.erro : "não configurado"}).`);
    }
  }
  if (!coreDisponivel) conclusao.push("Core AWS não disponível para relay (CORE_API_URL/CRON_SECRET ausentes ou esta instância é o Core).");

  return {
    host: server.host,
    fluxo_atual: coreDisponivel ? "Painel (direto) com fallback → Core AWS → IPTV" : "Painel (direto) → IPTV",
    core_configurado: coreDisponivel,
    resultados,
    conclusao,
  };
}
