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
  opts: { action: string; categoryId?: string; contentId?: string }
): string {
  const base = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, "") : `http://${host}`;
  const params = new URLSearchParams({
    username: creds.username ?? "",
    password: creds.password ?? "",
    action: opts.action,
  });
  if (opts.categoryId) params.set("category_id", opts.categoryId);
  if (opts.contentId) {
    if (opts.action === "get_series_info") params.set("series_id", opts.contentId);
    else params.set("vod_id", opts.contentId);
  }
  return `${base}/player_api.php?${params.toString()}`;
}

/** Execução local (fallback quando o Core AWS não está configurado). */
export async function fetchXtreamCatalog(
  serverId: string,
  creds: PlayerCreds,
  opts: { action: string; categoryId?: string; contentId?: string }
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
    console.log(
      `[player-catalog] host=${server.host} action=${opts.action} itens=${Array.isArray(json) ? json.length : "objeto"}`
    );
    return json;
  } finally {
    clearTimeout(timer);
  }
}
