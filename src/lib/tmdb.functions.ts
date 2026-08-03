import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

const feedSchema = z.enum(["movie_recent", "movie_upcoming", "movie_popular", "tv_recent", "tv_popular"]);
const mediaSchema = z.enum(["movie", "tv"]);

/** Lista de lançamentos TMDB já cruzada com o catálogo dos servidores do usuário. */
export const getTmdbFeed = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { feed: string; page?: number; query?: string }) =>
    z.object({ feed: feedSchema, page: z.number().min(1).max(10).optional(), query: z.string().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { fetchFeed, searchTmdb } = await import("./tmdb.server");
    const { titleKey } = await import("./iptv-catalog.server");

    const cards = data.query?.trim()
      ? await searchTmdb(data.query.trim())
      : await fetchFeed(data.feed, data.page ?? 1);

    // Apenas servidores verificados: com catálogo IPTV já sincronizado.
    const { data: servers } = await context.supabase
      .from("servers")
      .select("id")
      .not("catalog_synced_at", "is", null);
    const totalServers = servers?.length ?? 0;
    const verifiedIds = new Set((servers ?? []).map((s) => s.id));

    const keys = [...new Set(cards.flatMap((c) => [titleKey(c.title), titleKey(c.original_title)]).filter(Boolean))];
    const matchMap = new Map<string, Set<string>>();
    if (keys.length && totalServers) {
      const { data: rows } = await context.supabase
        .from("iptv_catalog_items")
        .select("server_id, title_key")
        .in("title_key", keys)
        .is("removed_at", null);
      for (const r of rows ?? []) {
        if (!verifiedIds.has(r.server_id)) continue;
        const set = matchMap.get(r.title_key) ?? new Set<string>();
        set.add(r.server_id);
        matchMap.set(r.title_key, set);
      }
    }

    return {
      totalServers,
      items: cards.map((c) => {
        const ids = new Set<string>([
          ...(matchMap.get(titleKey(c.title)) ?? []),
          ...(matchMap.get(titleKey(c.original_title)) ?? []),
        ]);
        return { ...c, found_count: ids.size, missing_count: Math.max(totalServers - ids.size, 0) };
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
      .select("id, name, owner_id, current_status, last_iptv_sync_at")
      .not("catalog_synced_at", "is", null)
      .order("name");

    const firstSeen = new Map<string, string>();
    if (keys.length) {
      const { data: rows } = await context.supabase
        .from("iptv_catalog_items")
        .select("server_id, first_seen_at")
        .in("title_key", keys)
        .is("removed_at", null);
      for (const r of rows ?? []) {
        const prev = firstSeen.get(r.server_id);
        if (!prev || r.first_seen_at < prev) firstSeen.set(r.server_id, r.first_seen_at);
      }
    }

    // Nunca enviar ao navegador o ID interno nem o nome real de servidores de terceiros.
    const { maskServerId, maskServerName } = await import("./server-mask.server");

    const availability = (servers ?? []).map((s) => {
      const mine = s.owner_id === context.userId;
      return {
        server_id: maskServerId(s.id, mine),
        name: maskServerName(s.id, mine, s.name),
        is_mine: mine,
        status: s.current_status as string,
        last_sync_at: s.last_iptv_sync_at as string | null,
        found_at: firstSeen.get(s.id) ?? null,
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

    return { detail, availability, podium, following: !!follow };
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
