import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) =>
  !Number.isNaN(Date.parse(`${d}T12:00:00Z`)), "Informe uma data válida.");
const teamSchema = z.string().regex(/^\d{2,12}$/);
const leagues = [
  { id: "4351", name: "Brasileirão Série A" },
  { id: "4501", name: "Libertadores" },
  { id: "4480", name: "Champions League" },
  { id: "4328", name: "Premier League" },
  { id: "4335", name: "La Liga" },
  { id: "4332", name: "Serie A Italiana" },
  { id: "4331", name: "Bundesliga" },
] as const;
const base = "https://www.thesportsdb.com/api/v1/json/123/";
type RemoteEvent = Record<string, string | null | undefined>;
type RemotePlayer = Record<string, string | null | undefined>;
const matchCache = new Map<string, { at: number; events: FootballMatch[] }>();

export type FootballMatch = {
  id: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  homeBadge: string;
  awayBadge: string;
  league: string;
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
  supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
  userId: string;
  claims: Record<string, unknown>;
}) {
  // JWT claims are signed by the authentication provider. All other users
  // must pass the server-side role check, never a browser-only guard.
  if (String(context.claims.email || "").toLowerCase() === "victorsampaio133@gmail.com") return;
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Esta ferramenta é exclusiva do administrador.");
}

function localDateTime(raw: RemoteEvent) {
  const timestamp = raw.strTimestamp;
  const combined = raw.dateEvent && raw.strTime
    ? `${raw.dateEvent}T${raw.strTime.replace(/Z$/, "")}Z` : "";
  const iso = timestamp && !Number.isNaN(Date.parse(timestamp))
    ? new Date(timestamp).toISOString()
    : combined && !Number.isNaN(Date.parse(combined))
      ? new Date(combined).toISOString()
      : "";
  if (!iso) return { iso: "", day: raw.dateEvent || "", time: "Horário a confirmar" };
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Fortaleza",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza",
    hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return { iso, day, time };
}

async function fetchRemote<T>(path: string): Promise<T | null> {
  const response = await fetch(base + path, {
    headers: { Accept: "application/json", "User-Agent": "StreamMonitor-AdminVitrine/1.0" },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`Fonte esportiva indisponível (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

async function loadLeague(date: string, id: string, league: string): Promise<FootballMatch[]> {
  const key = `${date}:${id}`;
  const cached = matchCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.events;
  const res = await fetchRemote<{ events?: RemoteEvent[] | null }>(
    `eventsday.php?d=${encodeURIComponent(date)}&s=Soccer&l=${id}`
  );
  const events = (res?.events ?? [])
    .filter((e) => e.idEvent && e.strHomeTeam && e.strAwayTeam)
    .map((e): FootballMatch => {
      const when = localDateTime(e);
      return {
        id: e.idEvent!,
        home: e.strHomeTeam!,
        away: e.strAwayTeam!,
        homeId: e.idHomeTeam || "",
        awayId: e.idAwayTeam || "",
        homeBadge: e.strHomeTeamBadge || "",
        awayBadge: e.strAwayTeamBadge || "",
        league: e.strLeague || league,
        ...when,
      };
    });
  matchCache.set(key, { at: Date.now(), events });
  if (matchCache.size > 120) matchCache.delete(matchCache.keys().next().value!);
  return events;
}

/** Public schedule metadata, but the server function itself is admin-only. */
export const getVitrineFootballMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ date: dateSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballAdmin(context);
    // Query the target UTC day plus the next date so late-night games are
    // correctly matched to the Fortaleza-local calendar day.
    const next = new Date(`${data.date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    const results = await Promise.allSettled(leagues.flatMap((l) =>
      [data.date, nextDate].map((d) => loadLeague(d, l.id, l.name))));
    const unique = new Map<string, FootballMatch>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const match of result.value) {
        if (match.day === data.date && !unique.has(match.id)) unique.set(match.id, match);
      }
    }
    const matches = [...unique.values()].sort((a, b) =>
      (a.iso || "9999").localeCompare(b.iso || "9999")).slice(0, 35);
    return {
      matches,
      source: "TheSportsDB",
      partial: true, // Free API caps a league/date query at 3 matches.
      sourcesSucceeded: results.filter((x) => x.status === "fulfilled").length,
      sourcesTotal: results.length,
    };
  });

export const getVitrineFootballPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: teamSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballAdmin(context);
    const response = await fetchRemote<{ player?: RemotePlayer[] | null }>(
      `lookup_all_players.php?id=${data.teamId}`);
    const players: FootballPlayer[] = (response?.player ?? [])
      .filter((p) => !!p.idPlayer && !!p.strPlayer)
      .slice(0, 30)
      .map((p) => ({
        id: p.idPlayer!,
        name: p.strPlayer!,
        position: p.strPosition || "",
        image: p.strCutout || p.strThumb || "",
        creativeCommons: p.strCreativeCommons === "Yes",
      }));
    return { players, source: "TheSportsDB" };
  });

/** Proxy *only* sports database artwork to an authorized admin after rights confirmation.
 * The flag is not a substitute for having the actual licence: the admin UI
 * explains that source/creator/publicity and trademark permissions still matter.
 */
export const getVitrineFootballImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    url: z.string().url().max(1024),
    rightsConfirmed: z.literal(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFootballAdmin(context);
    const url = new URL(data.url);
    if (url.protocol !== "https:" ||
      !["www.thesportsdb.com", "r2.thesportsdb.com", "api.thesportsdb.com"].includes(url.hostname) ||
      !url.pathname.startsWith("/images/")) {
      throw new Error("Origem de imagem não autorizada.");
    }
    const response = await fetch(url.toString(), { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Imagem indisponível.");
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!["image/png", "image/jpeg", "image/webp"].includes(type || "")) throw new Error("Formato de imagem não suportado.");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 2_500_000) throw new Error("Imagem excede o limite de 2,5 MB.");
    return { dataUrl: `data:${type};base64,${Buffer.from(buffer).toString("base64")}` };
  });
