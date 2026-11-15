import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The SportScore fixture API includes current league matches, team badges and
 * competition badges. The free tier requires a visible dofollow SportScore
 * attribution on every screen showing its data. This endpoint is admin-only.
 */
const API_BASE = "https://sportscore.com/api/v1";
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)),
  "Informe uma data válida.",
);
const leagues = [
  { id: "brazilian-serie-a", name: "Brasileirão Série A", group: "Brasil" },
  { id: "brazilian-serie-b", name: "Brasileirão Série B", group: "Brasil" },
  { id: "brazilian-cup", name: "Copa do Brasil", group: "Brasil" },
  { id: "conmebol-copa-libertadores", name: "Copa Libertadores", group: "América do Sul" },
  { id: "conmebol-copa-sudamericana", name: "Copa Sul-Americana", group: "América do Sul" },
  { id: "spanish-la-liga", name: "La Liga", group: "Europa" },
  { id: "english-premier-league", name: "Premier League", group: "Europa" },
  { id: "uefa-champions-league", name: "Champions League", group: "Europa" },
  { id: "uefa-europa-league", name: "Europa League", group: "Europa" },
  { id: "italian-serie-a", name: "Serie A Italiana", group: "Europa" },
  { id: "bundesliga", name: "Bundesliga", group: "Europa" },
  { id: "french-ligue-1", name: "Ligue 1", group: "Europa" },
  { id: "portuguese-primera-liga", name: "Liga Portugal", group: "Europa" },
  { id: "uefa-nations-league", name: "Nations League", group: "Seleções" },
  { id: "international-friendly", name: "Amistosos de Seleções", group: "Seleções" },
  { id: "fifa-world-cup", name: "Copa do Mundo", group: "Seleções" },
] as const;
export const footballLeagueOptions: { id: string; name: string; group: string }[] = [...leagues];
type RemoteMatch = {
  url?: string; slug?: string;
  home?: string; away?: string;
  home_logo?: string; away_logo?: string;
  competition?: string; competition_logo?: string;
  time?: string; status?: string;
};
type RemotePlayer = { name?: string; slug?: string; logo?: string; url?: string };
const cache = new Map<string, { at: number; events: FootballMatch[] }>();

export type FootballMatch = {
  id: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  homeBadge: string;
  awayBadge: string;
  leagueBadge?: string;
  league: string;
  leagueId?: string;
  time: string;
  iso: string;
  day: string;
};
export type FootballPlayer = {
  id: string;
  name: string;
  position: string;
  image: string;
  creativeCommons: boolean;
};

async function requireFootballAdmin(context: {
  supabase: any;
  userId: string;
  claims: Record<string, unknown>;
}) {
  if (String(context.claims.email || "").toLowerCase() === "victorsampaio133@gmail.com") return;
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (error || data !== true) throw new Error("Esta ferramenta é exclusiva do administrador.");
}
function kickoff(value?: string) {
  const date = value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
  if (!date) return { iso: "", day: "", time: "A confirmar" };
  return {
    iso: date.toISOString(),
    day: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(date),
  };
}
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path, {
    signal: AbortSignal.timeout(9000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SportScore respondeu HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
async function loadLeague(date: string, league: (typeof leagues)[number]) {
  const key = `${date}:${league.id}`;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.at < 5 * 60_000) return saved.events;
  const query = new URLSearchParams({
    sport: "football", date, competition: league.id, limit: "200",
  });
  const result = await getJson<{ matches?: RemoteMatch[] }>(`/fixtures/?${query}`);
  const events = (result.matches ?? []).filter((m) => !!m.home && !!m.away)
    .map((m): FootballMatch => ({
      id: m.url || `${league.id}:${date}:${m.home}:${m.away}`,
      home: m.home!,
      away: m.away!,
      homeId: "",
      awayId: "",
      homeBadge: m.home_logo || "",
      awayBadge: m.away_logo || "",
      leagueBadge: m.competition_logo || "",
      league: league.name,
      leagueId: league.id,
      ...kickoff(m.time),
    }));
  cache.set(key, { at: Date.now(), events });
  if (cache.size > 130) cache.delete(cache.keys().next().value!);
  return events;
}

/** Date-scoped, league-scoped real-world fixtures for the private admin studio. */
export const getVitrineFootballMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    date: dateSchema,
    leagues: z.array(z.string().max(70)).max(16).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballAdmin(context);
    const filtered = data.leagues?.length
      ? leagues.filter((l) => data.leagues!.includes(l.id)) : [...leagues];
    const next = new Date(`${data.date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    const tasks = filtered.flatMap((league) => [data.date, nextDate].map((date) => () => loadLeague(date, league)));
    const results: PromiseSettledResult<FootballMatch[]>[] = [];
    // Bounded concurrency: do not hammer the free source with every league at once.
    for (let i = 0; i < tasks.length; i += 5) {
      results.push(...await Promise.allSettled(tasks.slice(i, i + 5).map((run) => run())));
    }
    const matches = new Map<string, FootballMatch>();
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const m of r.value) if (m.day === data.date && !matches.has(m.id)) matches.set(m.id, m);
    }
    const featuredMatches = [...matches.values()].filter((m) =>
      m.leagueId !== "international-friendly" ||
      !/\\bU\\s?-?(?:1[5-9]|2[0-3])\\b|feminino|women|\\(w\\)/i.test(m.home + " " + m.away));
    return {
      matches: featuredMatches.sort((a, b) => {
        const aLeague = leagues.findIndex((l) => l.id === a.leagueId);
        const bLeague = leagues.findIndex((l) => l.id === b.leagueId);
        return aLeague - bLeague || a.iso.localeCompare(b.iso);
      }).slice(0, 160),
      leagues: footballLeagueOptions,
      source: "SportScore",
      partial: results.some((r) => r.status === "rejected"),
      sourcesSucceeded: results.filter((r) => r.status === "fulfilled").length,
      sourcesTotal: results.length,
    };
  });

/** Search real athletes by name. A result is not proof of the current team or rights to photograph. */
export const getVitrineFootballPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    query: z.string().trim().min(2).max(70),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballAdmin(context);
    const p = new URLSearchParams({ q: data.query, sport: "football", limit: "20" });
    const remote = await getJson<{ players?: RemotePlayer[] }>(`/search/?${p}`);
    const players: FootballPlayer[] = (remote.players || []).filter((x) => !!x.name)
      .map((x) => ({
        id: x.slug || x.url || x.name!,
        name: x.name!,
        position: "",
        image: x.logo || "",
        creativeCommons: false, // The API does not sublicense image/likeness rights.
      }));
    return { players, source: "SportScore", rightsVerificationRequired: true };
  });

/**
 * Images from remote sources are never treated as automatically licensed for
 * commercial artwork. Admin must affirm rights before requesting image bytes.
 */
export const getVitrineFootballImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    url: z.string().url().max(1024),
    rightsConfirmed: z.literal(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballAdmin(context);
    const u = new URL(data.url);
    if (u.protocol !== "https:" || u.port || u.username || u.password ||
      u.hostname !== "img.thesports.com" ||
      !/^\/football\/(?:team|player|competition)\/[0-9a-f]{32}\.(?:png|jpg|jpeg|webp)$/i.test(u.pathname)) {
      throw new Error("Origem da imagem não autorizada.");
    }
    const res = await fetch(u.toString(), {
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error("Imagem não disponível na fonte.");
    const type = res.headers.get("content-type")?.split(";")[0];
    if (!["image/png", "image/jpeg", "image/webp"].includes(type || "")) {
      throw new Error("Formato de imagem não suportado.");
    }
    if (Number(res.headers.get("content-length") || 0) > 2_500_000) {
      throw new Error("Imagem maior que 2,5 MB.");
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 2_500_000) throw new Error("Imagem maior que 2,5 MB.");
    return { dataUrl: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` };
  });
