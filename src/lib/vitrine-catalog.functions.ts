import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The Vitrine is a creative tool, not server monitoring. A reseller whose
// server monitoring is paused must still be able to select public TMDB titles.
// No private catalogue, server credentials or subscription data are returned.
const feedSchema = z.enum(["movie_recent", "tv_recent"]);
const mediaSchema = z.enum(["movie", "tv"]);

export const getVitrineTmdbFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { feed: string; query?: string }) =>
    z.object({
      feed: feedSchema,
      query: z.string().trim().max(120).optional(),
    }).parse(input))
  .handler(async ({ data }) => {
    const { fetchFeed, searchTmdb } = await import("./tmdb.server");
    const desiredType = data.feed === "tv_recent" ? "tv" : "movie";
    const rows = data.query
      ? await searchTmdb(data.query)
      : await fetchFeed(data.feed);
    return {
      items: rows
        .filter(row => row.media_type === desiredType && row.tmdb_id > 0 && !!row.poster_path)
        .slice(0, 24)
        .map(row => ({
          tmdb_id: row.tmdb_id,
          media_type: row.media_type,
          title: row.title,
          poster_path: row.poster_path,
          release_date: row.release_date,
          overview: row.overview,
        })),
    };
  });

export const getVitrineTmdbDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { media: string; id: number }) =>
    z.object({
      media: mediaSchema,
      id: z.number().int().positive(),
    }).parse(input))
  .handler(async ({ data }) => {
    const { fetchDetail } = await import("./tmdb.server");
    const detail = await fetchDetail(data.media, data.id);
    // Public descriptive metadata only; no availability from other accounts.
    return {
      detail: {
        tmdb_id: detail.tmdb_id,
        media_type: detail.media_type,
        title: detail.title,
        poster_path: detail.poster_path,
        release_date: detail.release_date,
        overview: detail.overview,
        genres: detail.genres,
      },
    };
  });
