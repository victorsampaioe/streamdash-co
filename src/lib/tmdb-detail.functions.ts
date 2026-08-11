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

    // 2. Busca servidores verificados
    const { data: servers } = await context.supabase
      .from("servers")
      .select("id, name, owner_id, current_status, last_iptv_sync_at, last_latency_ms")
      .not("catalog_synced_at", "is", null)
      .order("name");

    // 3. Busca disponibilidade real nos catálogos
    const itemMeta = new Map<string, { first_seen_at: string; quality?: string }>();
    if (keys.length) {
      const { data: rows } = await context.supabase
        .from("iptv_catalog_items")
        .select("server_id, first_seen_at, name")
        .in("title_key", keys)
        .is("removed_at", null);
      
      for (const r of rows ?? []) {
        const prev = itemMeta.get(r.server_id);
        const nameLower = r.name.toLowerCase();
        const quality = nameLower.includes("4k") ? "4K" : (nameLower.includes("fhd") || nameLower.includes("1080") ? "FHD" : "HD");
        if (!prev || r.first_seen_at < prev.first_seen_at) {
          itemMeta.set(r.server_id, { first_seen_at: r.first_seen_at, quality });
        }
      }
    }

    // 4. Mapeia disponibilidade respeitando privacidade
    const availability = (servers ?? []).map((s) => {
      const mine = s.owner_id === context.userId;
      const meta = itemMeta.get(s.id);
      return {
        server_id: maskServerId(s.id, mine),
        name: maskServerName(s.id, mine, s.name),
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
