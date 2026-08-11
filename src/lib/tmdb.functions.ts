import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

const feedSchema = z.enum(["movie_recent", "movie_upcoming", "movie_popular", "tv_recent", "tv_popular"]);
const mediaSchema = z.enum(["movie", "tv"]);

/** Lista de lançamentos TMDB já cruzada com o catálogo dos servidores do usuário. */
export const getTmdbFeed = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { feed: string; page?: number; query?: string; ranking?: boolean }) =>
    z.object({ feed: feedSchema, page: z.number().min(1).max(10).optional(), query: z.string().max(120).optional(), ranking: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { fetchFeed, searchTmdb } = await import("./tmdb.server");
    const { titleKey } = await import("./iptv-catalog.server");

    if (data.ranking) {
      const { data: stats } = await context.supabase
        .from("reseller_catalog_stats")
        .select("server_id, updates_last_7d, total_contents")
        .order("updates_last_7d", { ascending: false })
        .limit(10);
      
      const { data: servers } = await context.supabase
        .from("servers")
        .select("id, name, owner_id");
      
      return {
        ranking: (stats ?? []).map(s => {
          const srv = servers?.find(sv => sv.id === s.server_id);
          // Removida a máscara: sempre mostra o nome real para o ranking ser claro
          return {
            name: srv?.name ?? `Servidor ${s.server_id.slice(0, 5).toUpperCase()}`,
            updates: s.updates_last_7d,
            total: s.total_contents
          };
        })
      };
    }

    // 1. Busca servidores para cruzar dados
    const { data: servers } = await context.supabase
      .from("servers")
      .select("id")
      .not("catalog_synced_at", "is", null);
    const totalServers = servers?.length ?? 0;

    // 2. Modo Radar Global (Últimos encontrados)
    if (data.feed === 'movie_recent' && !data.query) {
      const { data: globalItems } = await context.supabase
        .from("iptv_global_catalog")
        .select(`
          *,
          first_server:servers!first_server_id(name)
        `)
        .order("first_detected_at", { ascending: false })
        .limit(20);

      if (globalItems && globalItems.length > 0) {
        return {
          totalServers,
          isRadar: true,
          items: globalItems.map(it => ({
            media_type: it.media_type,
            tmdb_id: it.tmdb_id,
            title: it.normalized_name,
            original_title: it.normalized_name,
            poster_path: it.poster_path,
            release_date: it.first_detected_at,
            vote_average: 0,
            found_count: it.servers_found_count || 0,
            first_server_name: (it.first_server as any)?.name || "Servidor",
            first_detected_at: it.first_detected_at,
            last_detected_at: it.last_detected_at
          }))
        };
      }
    }

    const cards = data.query?.trim()
      ? await searchTmdb(data.query.trim())
      : await fetchFeed(data.feed, data.page ?? 1);


    const verifiedIds = new Set((servers ?? []).map((s) => s.id));

    const keys = [...new Set(cards.flatMap((c) => [titleKey(c.title), titleKey(c.original_title)]).filter(Boolean))];
    const matchMap = new Map<string, { count: number, first_server?: string, first_at?: string }>();
    
    if (keys.length && totalServers) {
      const { data: globalMatches } = await context.supabase
        .from("iptv_global_catalog")
        .select(`
          title_key,
          servers_found_count,
          first_detected_at,
          first_server:servers!first_server_id(name)
        `)
        .in("title_key", keys);

      for (const m of globalMatches ?? []) {
        matchMap.set(m.title_key, {
          count: (m.servers_found_count || 0) as number,
          first_server: (m.first_server as any)?.name,
          first_at: m.first_detected_at as string
        });

      }
    }

    return {
      totalServers,
      items: cards.map((c) => {
        const match = matchMap.get(titleKey(c.title)) || matchMap.get(titleKey(c.original_title));
        return { 
          ...c, 
          found_count: match?.count || 0,
          first_server_name: match?.first_server,
          first_detected_at: match?.first_at
        };
      }),
    };
  });

/** Detalhes TMDB + ranking de quem adicionou primeiro + disponibilidade por servidor. */
export const getTmdbDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { media: string; id: number }) =>
    z.object({ media: mediaSchema, id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { fetchDetail } = await import("./tmdb.server");
    const { titleKey } = await import("./iptv-catalog.server");

    const detail = await fetchDetail(data.media, data.id);
    const keys = [...new Set([titleKey(detail.title), titleKey(detail.original_title)].filter(Boolean))];

    // Apenas servidores verificados (com catálogo IPTV sincronizado).
    const { data: servers } = await context.supabase
      .from("servers")
      .select("id, name, owner_id, current_status, last_iptv_sync_at, last_latency_ms")
      .not("catalog_synced_at", "is", null)
      .order("name");

    const itemMeta = new Map<string, { first_seen_at: string; quality?: string }>();
    if (keys.length) {
      const { data: rows } = await context.supabase
        .from("iptv_catalog_items")
        .select("server_id, first_seen_at, name")
        .in("title_key", keys)
        .is("removed_at", null);
      for (const r of rows ?? []) {
        const prev = itemMeta.get(r.server_id);
        // Tenta inferir qualidade do nome
        const quality = r.name.toLowerCase().includes("4k") ? "4K" : (r.name.toLowerCase().includes("fhd") || r.name.toLowerCase().includes("1080") ? "FHD" : "HD");
        if (!prev || r.first_seen_at < prev.first_seen_at) {
          itemMeta.set(r.server_id, { first_seen_at: r.first_seen_at, quality });
        }
      }
    }

    // Nunca enviar ao navegador o ID interno nem o nome real de servidores de terceiros.
    const { maskServerId, maskServerName } = await import("./server-mask.server");

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

/** Segue / deixa de seguir um título do TMDB. */
export const toggleTmdbFollow = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: {
    media: string; id: number; title: string; poster_path?: string | null; release_date?: string | null; follow: boolean;
  }) => z.object({
    media: mediaSchema,
    id: z.number().int().positive(),
    title: z.string().min(1).max(300),
    poster_path: z.string().max(300).nullable().optional(),
    release_date: z.string().max(20).nullable().optional(),
    follow: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.follow) {
      const { error } = await context.supabase
        .from("tmdb_follows").delete().eq("media_type", data.media).eq("tmdb_id", data.id);
      if (error) throw new Error(error.message);
      return { following: false };
    }
    const { titleKey } = await import("./iptv-catalog.server");
    const { error } = await context.supabase.from("tmdb_follows").upsert(
      {
        user_id: context.userId,
        media_type: data.media,
        tmdb_id: data.id,
        title: data.title,
        poster_path: data.poster_path ?? null,
        release_date: data.release_date || null,
        title_key: titleKey(data.title),
      },
      { onConflict: "user_id,media_type,tmdb_id" },
    );
    if (error) throw new Error(error.message);
    return { following: true };
  });
