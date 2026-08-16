// Server-only: helpers do Web Player (credenciais da sessão + acesso Xtream).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./crypto.server";
/**
 * Credenciais usadas pelo catálogo/stream do Web Player.
 * Prioriza as credenciais do cliente final (login no player) e cai para as
 * credenciais do servidor cadastradas pelo revendedor (sessões antigas).
 */
export async function getPlayerCredentials(session) {
    if (session.xtream_user && session.xtream_pass) {
        return {
            username: session.xtream_user,
            password: await decryptSecret(session.xtream_pass),
        };
    }
    const { getIptvCredentials } = await import("./iptv-credentials.server");
    return await getIptvCredentials(session.server_id);
}
export function buildXtreamCatalogUrl(host, creds, opts) {
    const base = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, "") : `http://${host}`;
    const params = new URLSearchParams({
        username: creds.username ?? "",
        password: creds.password ?? "",
        action: opts.action,
    });
    if (opts.categoryId)
        params.set("category_id", opts.categoryId);
    if (opts.contentId) {
        if (opts.action === "get_series_info" || opts.action === "get_episodes_list") {
            params.set("series_id", opts.contentId);
        }
        else {
            params.set("vod_id", opts.contentId);
        }
    }
    return `${base}/player_api.php?${params.toString()}`;
}
/** Remove credenciais de qualquer URL antes de logar. */
export function maskUrl(url) {
    return url.replace(/(username|password)=[^&]*/gi, (_m, k) => `${k}=***`);
}
/** Execução local (fallback quando o Core AWS não está configurado). */
export async function fetchXtreamCatalog(serverId, creds, opts) {
    const { data: server } = await supabaseAdmin
        .from("servers")
        .select("host")
        .eq("id", serverId)
        .maybeSingle();
    if (!server)
        throw new Error("Servidor não encontrado");
    const { UA_PLAYER } = await import("./iptv.server");
    const runRequest = async (action) => {
        const url = buildXtreamCatalogUrl(server.host, creds, { ...opts, action });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const started = Date.now();
        try {
            const res = await fetch(url, { headers: { "user-agent": UA_PLAYER }, signal: controller.signal });
            const text = await res.text();
            console.log(`[CATALOG_DEBUG] fluxo=Painel->IPTV(direto) servidor=${serverId} host=${server.host} usuario=${creds.username} action=${action} endpoint=${maskUrl(url)} status=${res.status} ms=${Date.now() - started} tamanho=${text.length} amostra=${text.slice(0, 200)}`);
            if (!res.ok)
                throw new Error(`HTTP ${res.status} em ${maskUrl(url)}`);
            return JSON.parse(text);
        }
        finally {
            clearTimeout(timer);
        }
    };
    try {
        let json = await runRequest(opts.action);
        // Fallback para séries: se get_episodes_list falhar ou for vazio, tenta get_series_info
        if (opts.action === "get_episodes_list" && (!json || (typeof json === "object" && Object.keys(json).length === 0))) {
            console.log(`[CATALOG_DEBUG] fallback get_episodes_list -> get_series_info id=${opts.contentId}`);
            json = await runRequest("get_series_info");
        }
        // Fallback para séries vazias: alguns painéis só respondem em get_series_categories+category_id
        if (opts.action === "get_series" && Array.isArray(json) && json.length === 0 && !opts.categoryId) {
            console.log("[CATALOG_DEBUG] get_series retornou 0 sem categoria — tentando get_series com category_id das categorias");
            try {
                const cats = await runRequest("get_series_categories");
                if (Array.isArray(cats) && cats.length > 0) {
                    const merged = [];
                    for (const cat of cats.slice(0, 5)) {
                        const url = buildXtreamCatalogUrl(server.host, creds, { action: "get_series", categoryId: String(cat.category_id) });
                        const res = await fetch(url, { headers: { "user-agent": UA_PLAYER } });
                        const text = await res.text();
                        try {
                            const part = JSON.parse(text);
                            if (Array.isArray(part))
                                merged.push(...part);
                        }
                        catch { /* ignore */ }
                    }
                    console.log(`[CATALOG_DEBUG] get_series por categoria retornou ${merged.length} itens`);
                    if (merged.length > 0)
                        json = merged;
                }
            }
            catch (e) {
                console.warn("[CATALOG_DEBUG] falha no fallback por categoria:", e?.message);
            }
        }
        // Normalização para o componente SeriesDetails
        if (opts.action === "get_episodes_list" || opts.action === "get_series_info") {
            if (json && !json.episodes && json.info) {
                // Já está no formato correto mas talvez sem episódios?
            }
            else if (json && json.episodes) {
                // OK
            }
            else if (json && typeof json === "object" && !json.info) {
                json = { info: json, episodes: json.episodes || {} };
            }
        }
        // Paginação local se for array
        if (Array.isArray(json) && opts.limit !== undefined) {
            const start = opts.offset || 0;
            const end = start + opts.limit;
            json = json.slice(start, end);
        }
        return json;
    }
    catch (err) {
        console.error(`[CATALOG_DEBUG] ERRO action=${opts.action} servidor=${serverId} erro=${err?.message}`);
        throw err;
    }
}
/**
 * ETAPA 3 — testa cada endpoint Xtream diretamente e informa qual retorna dados.
 */
export async function probeXtreamEndpoints(serverId, creds, seriesId) {
    const { data: server } = await supabaseAdmin
        .from("servers")
        .select("host")
        .eq("id", serverId)
        .maybeSingle();
    if (!server)
        throw new Error("Servidor não encontrado");
    const { UA_PLAYER } = await import("./iptv.server");
    const call = async (action, extra) => {
        const url = buildXtreamCatalogUrl(server.host, creds, { action, ...extra });
        const started = Date.now();
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        try {
            const res = await fetch(url, { headers: { "user-agent": UA_PLAYER }, signal: ctl.signal });
            const text = await res.text();
            let json = null;
            try {
                json = JSON.parse(text);
            }
            catch { /* ignore */ }
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
        }
        catch (e) {
            const out = { action, endpoint: maskUrl(url), status: 0, ms: Date.now() - started, tipo: "erro", quantidade: 0, amostra: "", erro: String(e?.message ?? e) };
            console.error(`[CATALOG_DEBUG][probe] ${JSON.stringify(out)}`);
            return out;
        }
    };
    const seriesCats = await call("get_series_categories");
    let firstSeriesCat;
    try {
        const parsed = JSON.parse(seriesCats.amostra.startsWith("[") ? seriesCats.amostra : "[]");
        firstSeriesCat = parsed?.[0]?.category_id != null ? String(parsed[0].category_id) : undefined;
    }
    catch { /* ignore */ }
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
/** Bases candidatas para um host cadastrado em qualquer formato. */
export function hostCandidates(host) {
    const clean = host.trim().replace(/\/+$/, "");
    if (/^https:\/\//i.test(clean))
        return [clean, clean.replace(/^https:/i, "http:")];
    if (/^http:\/\//i.test(clean))
        return [clean, clean.replace(/^http:/i, "https:")];
    return [`http://${clean}`, `https://${clean}`];
}
/**
 * Valida o login Xtream do cliente final.
 * 1) usa a mesma inteligência já existente (probeXtream: 3 UAs, http/https,
 *    player_api + panel_api);
 * 2) se ela não confirmar, tenta um fallback direto em todas as combinações
 *    de base/rota/User-Agent antes de declarar falha.
 */
export async function validateXtreamLogin(host, username, password) {
    const { probeXtream, UA_PLAYER, UA_BROWSER, UA_VLC } = await import("./iptv.server");
    let probeError = null;
    try {
        const probe = await probeXtream(host, username, password, { catalogMode: "auth" });
        if (probe?.login_ok)
            return { login_ok: true, account: probe.account ?? null, error: null, base: null };
        probeError = probe?.error ?? null;
    }
    catch (e) {
        probeError = String(e?.message ?? e);
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
                const timer = setTimeout(() => ctl.abort(), 12000);
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
                    let json = null;
                    try {
                        json = JSON.parse(text);
                    }
                    catch {
                        lastError = `Resposta não-JSON em ${base}/${path}`;
                        continue;
                    }
                    const ui = json?.user_info ?? json?.user ?? null;
                    if (ui && String(ui.auth ?? "1") !== "0" && String(ui.status ?? "Active").toLowerCase() !== "banned") {
                        console.log(`[player-login] fallback OK base=${base} path=${path}`);
                        return { login_ok: true, account: ui, error: null, base };
                    }
                    lastError = "Usuário ou senha inválidos.";
                }
                catch (e) {
                    lastError = String(e?.message ?? e).slice(0, 160);
                }
                finally {
                    clearTimeout(timer);
                }
            }
        }
    }
    return { login_ok: false, account: null, error: lastError ?? "Falha na autenticação Xtream", base: null };
}
