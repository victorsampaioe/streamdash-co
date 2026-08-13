import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIptvCredentials } from "./iptv-credentials.server";
import { UA_PLAYER } from "./iptv.server";

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; map: Record<string, string> }>();

/**
 * Item 7 — Resolve os IDs numéricos de categoria do Xtream para o nome legível.
 * Cache em memória de 10 min por servidor (a lista de categorias muda pouco).
 */
export async function getCategoryNames(serverId: string): Promise<Record<string, string>> {
  const hit = cache.get(serverId);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.map;

  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("host")
    .eq("id", serverId)
    .maybeSingle();
  if (!server?.host) return {};

  const creds = await getIptvCredentials(serverId);
  if (!creds.username || !creds.password) return {};

  const base = /^https?:\/\//i.test(server.host)
    ? server.host.replace(/\/+$/, "")
    : `http://${server.host}`;
  const auth = `username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  const map: Record<string, string> = {};

  await Promise.allSettled(
    ["get_live_categories", "get_vod_categories", "get_series_categories"].map(async (action) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      try {
        const res = await fetch(`${base}/player_api.php?${auth}&action=${action}`, {
          headers: { "User-Agent": UA_PLAYER },
          signal: ctl.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        for (const c of Array.isArray(json) ? json : []) {
          if (c?.category_id != null && c?.category_name) {
            map[String(c.category_id)] = String(c.category_name);
          }
        }
      } catch {
        /* categoria é cosmética: falha silenciosa */
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  cache.set(serverId, { at: Date.now(), map });
  return map;
}
