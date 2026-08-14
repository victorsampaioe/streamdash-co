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
    if (opts.action === "get_series_info" || opts.action === "get_series_episodes") params.set("series_id", opts.contentId);
    else params.set("vod_id", opts.contentId);
  }
  return `${base}/player_api.php?${params.toString()}`;
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

  const url = buildXtreamCatalogUrl(server.host, creds, opts);
  const { UA_PLAYER } = await import("./iptv.server");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA_PLAYER }, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[player-catalog] ${opts.action} host=${server.host} status=${res.status} body=${text.slice(0, 200)}`);
      throw new Error(`Servidor IPTV respondeu ${res.status}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      console.error(`[player-catalog] resposta não-JSON host=${server.host} body=${text.slice(0, 200)}`);
      throw new Error("Resposta inválida do servidor IPTV");
    }
    // Paginação local se for array
    if (Array.isArray(json) && opts.limit !== undefined) {
      const start = opts.offset || 0;
      const end = start + opts.limit;
      json = json.slice(start, end);
    }
    
    console.log(
      `[player-catalog] host=${server.host} action=${opts.action} itens=${Array.isArray(json) ? json.length : "objeto"}`
    );
    return json;
  } finally {
    clearTimeout(timer);
  }
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
