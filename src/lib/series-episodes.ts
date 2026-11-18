/**
 * Parse only seasons and episode labels from the Xtream get_series_info response.
 * Never return stream ids, stream URLs, accounts, images, or raw provider objects.
 * Some providers return "episodes" as an object keyed by season; others use arrays.
 */
export type SeriesEpisodeLabel = { number: number | null; name: string | null };
export type SeriesSeasonInfo = { number: number; episodes: SeriesEpisodeLabel[] };
export type SeriesEpisodeSummary = {
  seasons: SeriesSeasonInfo[];
  episodeCount: number;
  limited: boolean;
  provided: boolean;
};

const MAX_EPISODES = 1200;
const MAX_SEASONS = 80;

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function integer(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= maximum ? n : null;
}

function label(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim().slice(0, 180);
  return s || null;
}

export function parseSeriesEpisodes(raw: unknown): SeriesEpisodeSummary {
  const data = rec(raw);
  const groups = new Map<number, SeriesEpisodeLabel[]>();
  let total = 0;
  let limited = false;
  const ensure = (num: number | null) => {
    if (num === null) return null;
    if (!groups.has(num) && groups.size >= MAX_SEASONS) {
      limited = true;
      return null;
    }
    if (!groups.has(num)) groups.set(num, []);
    return groups.get(num)!;
  };

  // Preserve provider-confirmed season labels, even when it omits episode lists.
  if (Array.isArray(data?.seasons)) {
    for (const season of data.seasons) {
      const obj = rec(season);
      ensure(integer(obj?.season_number ?? obj?.season, 200));
    }
  }

  const addEpisode = (entry: unknown, fallbackSeason: number | null) => {
    const obj = rec(entry);
    if (!obj) return;
    const number = integer(obj.episode_num ?? obj.episode_number ?? obj.episode, 100_000);
    const seasonNumber = integer(obj.season ?? obj.season_number, 200) ?? fallbackSeason;
    const bucket = ensure(seasonNumber);
    if (!bucket) return;
    if (total >= MAX_EPISODES) {
      limited = true;
      return;
    }
    bucket.push({number, name: label(obj.title ?? obj.name)});
    total++;
  };

  const episodes = data?.episodes;
  if (Array.isArray(episodes)) {
    for (const episode of episodes) {
      if (Array.isArray(episode)) {
        for (const entry of episode) addEpisode(entry, null);
      } else {
        addEpisode(episode, null);
      }
    }
  } else if (rec(episodes)) {
    for (const [key, items] of Object.entries(episodes as Record<string, unknown>)) {
      const season = integer(key, 200);
      if (Array.isArray(items)) {
        for (const entry of items) addEpisode(entry, season);
      } else if (rec(items)) {
        for (const entry of Object.values(rec(items)!)) addEpisode(entry, season);
      }
    }
  }

  const seasons = [...groups.entries()].sort((a,b)=>a[0]-b[0])
    .map(([number, rows])=>({
      number,
      episodes: rows.sort((a,b)=>(a.number ?? 100_001)-(b.number ?? 100_001)),
    }));
  return {seasons, episodeCount:total, limited, provided:!!data && (Array.isArray(episodes) || !!rec(episodes) || Array.isArray(data.seasons))};
}
