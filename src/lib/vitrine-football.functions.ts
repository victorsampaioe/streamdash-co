import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidFeature } from "@/lib/premium-feature-access";

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
  broadcasts?: string[];
  playerPhoto?: string;
  playerName?: string;
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

/** Date-scoped, league-scoped real-world fixtures for the 
const FOOTBALL_API_URL = "https://ftwb.notiffly.com.br/jogos";
const MAIN_TEAMS = ["flamengo", "corinthians", "palmeiras", "sao paulo", "santos", "vasco", "fluminense", "botafogo", "gremio", "internacional", "atletico mg", "atletico mineiro", "cruzeiro", "bahia", "vitoria", "fortaleza", "ceara", "sport", "athletico", "coritiba"];
const simplify = (input: unknown) => String(input ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function pick(record: unknown, ...fields: string[]): unknown {
  if (!record || typeof record !== "object") return undefined;
  const data = record as Record<string, unknown>;
  return fields.map((key) => data[key]).find((value) => value !== null && value !== undefined && value !== "");
}
function teamName(source: unknown): string {
  return typeof source === "string" ? source : String(pick(source,"nome","name","short_name") || "");
}
function teamLogo(source: unknown): string {
  const url = String(pick(source,"escudo","logo","image","badge") || "");
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? url : ""; }
  catch { return ""; }
}
function getBroadcasts(record: unknown): string[] {
  let raw = pick(record,"canais","transmissoes","transmissao","onde_assistir","broadcast","tv");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = pick(raw,"canais","channels");
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;|]/) : [];
  return [...new Set(list.map((item) => typeof item === "string" ? item :
    String(pick(item,"nome","name","canal") || "")).map((value) => value.trim()).filter(Boolean))].slice(0,3);
}
function apiFixture(record: unknown, index: number, date: string): FootballMatch | null {
  const homeObj = pick(record,"mandante","time_casa","home_team","casa","home");
  const awayObj = pick(record,"visitante","time_fora","away_team","fora","away");
  const home = teamName(homeObj), away = teamName(awayObj);
  if (!home || !away) return null;
  if (!MAIN_TEAMS.some((team) => simplify(home).includes(team) || simplify(away).includes(team))) return null;
  const competition = pick(record,"campeonato","competicao","league","competition");
  const league = typeof competition === "string" ? competition : String(pick(competition,"nome","name")||"Futebol");
  const inputTime = String(pick(record,"data_hora","datetime","inicio","horario","hora","kickoff")||"");
  const when = /^\d{4}-\d{2}-\d{2}T/.test(inputTime) && !Number.isNaN(Date.parse(inputTime)) ? kickoff(inputTime) :
    {iso:"",day:date,time: /^\d{2}:\d{2}$/.test(inputTime)?inputTime:"A confirmar"};
  const id = String(pick(record,"id","jogo_id","match_id")||[date,home,away,index].join(":"));
  const player = pick(record,"jogador_destaque","jogador","featured_player");
  const playerPhoto = teamLogo({image:pick(player,"foto","imagem","image","photo")});
  return {id,home,away,homeId:"",awayId:"",homeBadge:teamLogo(homeObj),awayBadge:teamLogo(awayObj),
    league,leagueId:simplify(league),...when,broadcasts:getBroadcasts(record),
    playerPhoto,playerName:playerPhoto ? teamName(player) : ""};
}
/** Server-side: the FTWB key never reaches the browser or git. */
export const getVitrineFootballMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    date: dateSchema,
    leagues: z.array(z.string().max(70)).max(16).optional(),
  }).parse(input))
  .handler(async ({data, context}) => {
    await requirePaidFeature(context);
    const key = process.env.FTWB_API_KEY;
    if (!key) throw new Error("FTWB_API_KEY não configurada no ambiente do servidor.");
    const url = new URL(FOOTBALL_API_URL);
    url.searchParams.set("pais","brasil");
    url.searchParams.set("data",data.date);
    url.searchParams.set("status","agendado,ao_vivo");
    const response = await fetch(url,{headers:{"x-api-key":key,Accept:"application/json"},signal:AbortSignal.timeout(9000),cache:"no-store"});
    if(!response.ok) throw new Error("Não foi possível consultar a API FTWB (HTTP "+response.status+").");
    const payload:unknown = await response.json();
    const list = Array.isArray(payload)?payload:pick(payload,"jogos","data","results");
    if(!Array.isArray(list)) throw new Error("Formato da lista de jogos da FTWB não reconhecido.");
    const seen = new Set<string>();
    const matches = list.map((raw,i)=>apiFixture(raw,i,data.date)).filter((match):match is FootballMatch=>!!match)
      .filter((match)=>{const unique=[simplify(match.home),simplify(match.away),match.time].join("|");if(seen.has(unique))return false;seen.add(unique);return true;})
      .sort((a,b)=>a.time.localeCompare(b.time)).slice(0,9);
    return {matches,leagues:footballLeagueOptions,source:"FTWB",partial:false,sourcesSucceeded:1};
  });

rights to photograph. */
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
        id: x.url || x.logo || x.slug || x.name!,
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
