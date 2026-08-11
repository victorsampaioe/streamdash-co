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
      // Consulta segura: retorna apenas nome e contadores, sem expor dados de outros donos.
      const { data: rows } = await (context.supabase as any).rpc("get_catalog_update_ranking", { _limit: 10 });

      return {
        ranking: ((rows ?? []) as Array<{ name: string; updates: number; total: number }>).map((r) => ({
          name: r.name ?? "Servidor Privado",
          updates: r.updates ?? 0,
          total: r.total ?? 0,
        })),
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
          media_type,
          tmdb_id,
          normalized_name,
          poster_path,
          servers_found_count,
          last_detected_at
        `)
        .eq("media_type", "movie") 
        .not("tmdb_id", "is", null)
        .not("poster_path", "is", null)
        .neq("poster_path", "")
        .order("last_detected_at", { ascending: false })
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
            release_date: it.last_detected_at,
            vote_average: 0,
            found_count: it.servers_found_count || 0
          }))
        };
      }
    }

    const cards = data.query?.trim()
      ? await searchTmdb(data.query.trim())
      : await fetchFeed(data.feed, data.page ?? 1);

    // Filtragem final para garantir que apenas itens válidos apareçam no Radar
    const validCards = cards.filter(c => {
      // Se for busca ou abas normais, garantir poster e tmdb_id
      const hasPoster = !!c.poster_path;
      const hasTmdbId = !!c.tmdb_id;
      
      // Aplicar segregação por abas
      if (data.feed.startsWith('movie_')) {
        return c.media_type === 'movie' && hasPoster && hasTmdbId;
      }
      if (data.feed.startsWith('tv_')) {
        return c.media_type === 'tv' && hasPoster && hasTmdbId;
      }
      return hasPoster && hasTmdbId;
    });

    const verifiedIds = new Set((servers ?? []).map((s) => s.id));

    const keys = [...new Set(validCards.flatMap((c) => [titleKey(c.title), titleKey(c.original_title)]).filter(Boolean))];
    const matchMap = new Map<string, { count: number, first_server?: string, first_at?: string }>();
    
    if (keys.length && totalServers) {
      const feedMedia = data.feed.startsWith("tv_") ? "tv" : "movie";
      const { data: globalMatches } = await context.supabase
        .from("iptv_global_catalog")
        .select("title_key, servers_found_count, media_type")
        .eq("media_type", feedMedia)
        .in("title_key", keys);

      for (const m of globalMatches ?? []) {
        const prev = matchMap.get(m.title_key)?.count ?? 0;
        matchMap.set(m.title_key, { count: Math.max(prev, (m.servers_found_count || 0) as number) });
      }
    }


    return {
      totalServers,
      items: validCards.map((c) => {
        const match = matchMap.get(titleKey(c.title)) || matchMap.get(titleKey(c.original_title));
        return { 
          ...c, 
          tmdb_id: c.tmdb_id, // Garantir tmdb_id numérico
          found_count: match?.count || 0
        };
      }),

    };
  });

/** Detalhes TMDB + disponibilidade. Mapeado para arquivo separado para evitar inflar o bundle. */
export { getTmdbDetail } from "./tmdb-detail.functions";

/** Rotina de reparação de posters. */
export { repairTmdbPosters } from "./tmdb-repair.functions";


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
