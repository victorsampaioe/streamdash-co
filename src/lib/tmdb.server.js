// Server-only: cliente da API TMDB (chave nunca vai para o browser).
const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";
function apiKey() {
    const key = process.env["TMDB_API_KEY"];
    if (!key)
        throw new Error("TMDB_API_KEY não configurada. Cadastre a chave da API TMDB para usar a Inteligência de Conteúdo.");
    return key;
}
async function tmdb(path, params = {}) {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("api_key", apiKey());
    url.searchParams.set("language", "pt-BR");
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok)
        throw new Error(`TMDB ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
    return (await res.json());
}
function toCard(raw, media) {
    return {
        media_type: media,
        tmdb_id: raw.id,
        title: raw.title ?? raw.name ?? "",
        original_title: raw.original_title ?? raw.original_name ?? raw.title ?? raw.name ?? "",
        overview: raw.overview ?? "",
        poster_path: raw.poster_path ?? null,
        backdrop_path: raw.backdrop_path ?? null,
        vote_average: Math.round((raw.vote_average ?? 0) * 10) / 10,
        release_date: raw.release_date || raw.first_air_date || null,
    };
}
const FEEDS = {
    movie_recent: { path: "/movie/now_playing", media: "movie" },
    movie_upcoming: { path: "/movie/upcoming", media: "movie" },
    movie_popular: { path: "/movie/popular", media: "movie" },
    tv_recent: { path: "/tv/on_the_air", media: "tv" },
    tv_popular: { path: "/tv/popular", media: "tv" },
};
export async function fetchFeed(feed, page = 1) {
    const cfg = FEEDS[feed];
    const data = await tmdb(cfg.path, { page: String(page), region: "BR" });
    return (data.results ?? []).map((r) => toCard(r, cfg.media));
}
export async function searchTmdb(query) {
    const data = await tmdb("/search/multi", {
        query,
        page: "1",
        include_adult: "false",
    });
    return (data.results ?? [])
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .map((r) => toCard(r, r.media_type));
}
export async function fetchDetail(media, id) {
    const raw = await tmdb(`/${media}/${id}`, { append_to_response: "credits" });
    const crew = raw.credits?.crew ?? [];
    const director = crew.find((c) => c.job === "Director")?.name ??
        raw.created_by?.[0]?.name ??
        null;
    return {
        ...toCard(raw, media),
        genres: (raw.genres ?? []).map((g) => g.name),
        runtime_minutes: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
        countries: (raw.production_countries ?? []).map((c) => c.name).concat(raw.production_countries?.length ? [] : raw.origin_country ?? []),
        director,
        cast: (raw.credits?.cast ?? []).slice(0, 8).map((c) => c.name),
        seasons: raw.number_of_seasons ?? null,
    };
}
