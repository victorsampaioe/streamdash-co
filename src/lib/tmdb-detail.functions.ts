import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchDetail } from "./tmdb.server";
import { titleKey } from "./iptv-catalog.server";
import { maskServerId, maskServerName } from "./server-mask.server";

const mediaSchema = z.enum(["movie", "tv"]);

/** 
 * Detalhes TMDB + ranking de quem adicionou primeiro + disponibilidade por servidor.
 * Fix: Garante tmdb_id e poster_path no fluxo para evitar links quebrados.
 */
export const getTmdbDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { media: string; id: number }) =>
    z.object({ media: mediaSchema, id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    // 1. Busca detalhes no TMDB
    const detail = await fetchDetail(data.media, data.id);
    const keys = [...new Set([titleKey(detail.title), titleKey(detail.original_title)].filter(Boolean))];

    // 2. Encontrar o registro no catálogo global para este TMDB ID
    const { data: globalEntry } = await context.supabase
      .from("iptv_global_catalog")
      .select("id")
      .eq("tmdb_id", data.id)
      .eq("media_type", data.media === "tv" ? "tv" : "movie")
      .maybeSingle();

    // 3. Busca disponibilidade real vinculada ao catálogo global
    const itemMeta = new Map<string, { first_seen_at: string; quality?: string }>();
    if (globalEntry) {
      const { data: matches } = await context.supabase
        .from("iptv_catalog_matches")
        .select("server_id, detected_at, raw_name")
        .eq("catalog_id", globalEntry.id);
      
      for (const m of matches ?? []) {
        const nameLower = (m.raw_name || "").toLowerCase();
        const quality = nameLower.includes("4k") ? "4K" : (nameLower.includes("fhd") || nameLower.includes("1080") ? "FHD" : "HD");
        itemMeta.set(m.server_id, { first_seen_at: m.detected_at || new Date().toISOString(), quality });
      }
    }

    // 4. Busca servidores verificados para cruzar
    const { data: servers } = await context.supabase
      .from("servers")
      .select("id, name, owner_id, current_status, last_iptv_sync_at, last_latency_ms")
      .not("catalog_synced_at", "is", null)
      .order("name");

    // 4. Mapeia disponibilidade respeitando privacidade
    const availability = (servers ?? []).map((s) => {
      const mine = s.owner_id === context.userId;
      const meta = itemMeta.get(s.id);
      // Ajustar Ranking do Radar para exibir somente nome público do servidor
      // Garantir que DNS/Host/IP nunca cheguem ao frontend
      return {
        server_id: maskServerId(s.id, mine),
        name: s.name || "Servidor Privado",
        is_mine: mine,
        status: s.current_status as string,
        last_sync_at: s.last_iptv_sync_at as string | null,
        latency_ms: s.last_latency_ms,
        found_at: meta?.first_seen_at ?? null,
        quality: meta?.quality ?? null,
      };
    });

    const podium = availability
      .filter((a) => a.found_at)
      .sort((a, b) => (a.found_at! < b.found_at! ? -1 : 1));

    // 5. Status de seguimento e estatísticas globais
    const { data: follow } = await context.supabase
      .from("tmdb_follows")
      .select("id")
      .eq("media_type", data.media)
      .eq("tmdb_id", data.id)
      .maybeSingle();

    const { data: globalHistory } = await context.supabase
      .from("tmdb_content_history")
      .select("first_detected_at, servers_found_count")
      .eq("title_key", keys[0])
      .maybeSingle();

    return {
      detail,
      availability,
      podium,
      following: !!follow,
      global_stats: globalHistory ? {
        first_seen_at: globalHistory.first_detected_at as string,
        server_count: (globalHistory.servers_found_count || 0) as number
      } : null
    };
  });
