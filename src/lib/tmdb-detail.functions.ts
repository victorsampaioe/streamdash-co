import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { fetchDetail } from "./tmdb.server";
import { titleKey } from "./iptv-catalog.server";

const mediaSchema = z.enum(["movie", "tv"]);

/**
 * Detalhes TMDB + disponibilidade real por servidor.
 * Fonte única: iptv_catalog_matches (via RPC radar_title_availability),
 * a mesma base usada pelo contador exibido no card do Radar.
 */
export const getTmdbDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { media: string; id: number }) =>
    z.object({ media: mediaSchema, id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const detail = await fetchDetail(data.media, data.id);

    const keys = [...new Set([titleKey(detail.title), titleKey(detail.original_title)].filter(Boolean))];
    const mediaType = data.media === "tv" ? "tv" : "movie";

    const { data: rows, error } = await context.supabase.rpc("radar_title_availability", {
      _title_keys: keys,
      _media: mediaType,
    });
    if (error) console.error("[Radar] falha ao carregar disponibilidade", { keys, mediaType, error: error.message });

    const availability = (rows ?? []).map((r: any) => ({
      server_id: r.server_id as string,
      name: (r.name as string) || "Servidor Privado",
      is_mine: !!r.is_mine,
      status: r.status as string,
      last_sync_at: (r.last_sync_at as string | null) ?? null,
      found_at: (r.found_at as string | null) ?? null,
      quality: (r.quality as string | null) ?? null,
    }));

    console.info("[Radar] disponibilidade", {
      tmdb_id: data.id,
      media: mediaType,
      keys,
      servidores_encontrados: availability.length,
    });

    const podium = [...availability]
      .filter((a) => a.found_at)
      .sort((a, b) => (a.found_at! < b.found_at! ? -1 : 1));

    const { data: follow } = await context.supabase
      .from("tmdb_follows")
      .select("id")
      .eq("media_type", data.media)
      .eq("tmdb_id", data.id)
      .maybeSingle();

    const { data: globalHistory } = await context.supabase
      .from("iptv_global_catalog")
      .select("first_detected_at")
      .in("title_key", keys)
      .eq("media_type", mediaType)
      .order("first_detected_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return {
      detail,
      availability,
      podium,
      following: !!follow,
      global_stats: {
        first_seen_at: (globalHistory?.first_detected_at as string | null) ?? null,
        server_count: availability.length,
      },
    };
  });
