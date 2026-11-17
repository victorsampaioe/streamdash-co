import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidFeature } from "@/lib/premium-feature-access";
import { isMajorFootballCompetition, isYouthFootballFixture } from "@/lib/vitrine-football-competitions";
import { extractFtwbBroadcasts } from "@/lib/vitrine-ftwb-broadcasts";

/**
 * FTWB is the primary fixture provider for subscribed users.
 * The API key stays server-side; SportScore is retained only for the
 * separate admin player lookup and licensed-image workflow.
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
type RemotePlayer = { name?: string; slug?: string; logo?: string; url?: string; team?: string | { name?: string }; club?: string | { name?: string }; team_name?: string };
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
  status?: string;
  scoreLabel?: string;
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

/** FTWB fixtures are fetched on the server for authenticated paid resellers. */
const FOOTBALL_API_URL = "https://ftwb.notiffly.com.br/jogos";
const simplify = (input: unknown) => String(input ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function pick(record: unknown, ...fields: string[]): unknown {
  if (!record || typeof record !== "object") return undefined;
  const data = record as Record<string, unknown>;
  return fields.map((key) => data[key]).find((value) => value !== null && value !== undefined && value !== "");
}
function teamName(source: unknown): string {
  return typeof source === "string" ? source : String(pick(source,"nome","name","short_name","shortName","team_name","teamName","title") || "");
}
/** A FTWB fixture can supply team images inside the team or in separate match fields. */
function teamLogo(source: unknown): string {
  const candidate = typeof source === "string" ? source :
    pick(source,"escudo","logo","image","badge","crest","shield","escudo_url","logo_url","url_escudo","logoUrl","badge_url","image_url","imageUrl","foto");
  const value=typeof candidate==="string"?candidate:String(pick(candidate,"url","src","href","original")||"");
  if(!value.trim())return "";
  try {
    const parsed=new URL(value.trim().startsWith("//")?"https:"+value.trim():value.trim(),"https://ftwb.notiffly.com.br");
    if(!["http:","https:"].includes(parsed.protocol))return "";
    // Preserve the actual URL from FTWB; never fabricate a new image address.
    if(parsed.protocol==="http:")return "";
    return parsed.toString();
  }catch{return "";}
}
function matchBadge(record:unknown,team:unknown,side:"home"|"away"):string{
  const embedded=teamLogo(typeof team==="object"?team:undefined);
  if(embedded)return embedded;
  const fields=side==="home"
    ?["escudo_mandante","escudo_casa","logo_mandante","logo_casa","mandante_escudo","mandante_logo","time_casa_escudo","time_casa_logo","home_logo","homeBadge","homeTeamLogo","teamHomeBadge","escudoMandante","logoMandante","mandanteLogo","home_team_badge","home_team_logo","logoA","escudoA","logo_time_a","escudo_time_a","timeA_logo","timeALogo","logo_home"]
    :["escudo_visitante","escudo_fora","logo_visitante","logo_fora","visitante_escudo","visitante_logo","time_fora_escudo","time_fora_logo","away_logo","awayBadge","awayTeamLogo","teamAwayBadge","escudoVisitante","logoVisitante","visitanteLogo","away_team_badge","away_team_logo","logoB","escudoB","logo_time_b","escudo_time_b","timeB_logo","timeBLogo","logo_away"];
  const first=pick(record,...fields);
  const candidates=pick(record,"logos","escudos","badges","images");
  const nested=pick(candidates,side==="home"?"home":"away",side==="home"?"mandante":"visitante",side==="home"?"casa":"fora");
  const value=first||nested;
  return value?teamLogo(typeof value==="string"?value:{image:value}):"";
}
function apiFixture(record: unknown, index: number, date: string): FootballMatch | null {
  const nested=pick(record,"times","equipes","teams");
  const homeObj = pick(record,"mandante","time_casa","home_team","casa","home","teamHome","team_home","equipe_mandante","timeA","equipeA")
    ?? pick(nested,"mandante","casa","home","homeTeam");
  const awayObj = pick(record,"visitante","time_fora","away_team","fora","away","teamAway","team_away","equipe_visitante","timeB","equipeB")
    ?? pick(nested,"visitante","fora","away","awayTeam");
  const home = teamName(homeObj), away = teamName(awayObj);
  if (!home || !away) return null;
  const competition = pick(record,"campeonato","competicao","league","competition","tournament","torneio","nome_campeonato","campeonato_nome","leagueName","competitionName");
  const league = typeof competition === "string" ? competition : String(pick(competition,"nome","name","title","descricao","description")||"Futebol");
  // Respect kickoff time even if the match is already finished; never manufacture "00:00".
  const clock = pick(record,"horario","hora","hora_inicio","horario_inicio","horaJogo",
    "horarioJogo","hora_jogo","inicio_hora","start_time","match_time","time");
  const dateTime = pick(record,"data_hora","datetime","inicio","kickoff","starts_at",
    "dataHora","date_time","matchDateTime","data_e_hora");
  const dateTimeText=String(dateTime||"").trim();
  const inputTime=/(?:T|\s)\d{1,2}:\d{2}/.test(dateTimeText)
    ?dateTimeText:String(clock||dateTime||"").trim();
  const timeWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(inputTime);
  const absolute = timeWithZone && !Number.isNaN(Date.parse(inputTime))
    ? kickoff(inputTime) : null;
  // Trust the provider's explicit fixture date when it is present. The requested
  // date is only a fallback for records without their own date field.
  const sourceDate=String(pick(record,"data","data_jogo","date","match_date","matchDate","dataPartida","dia")||"").trim();
  const isoSource=/^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/.exec(sourceDate)?.[1];
  const brazilianSource=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(sourceDate);
  const sourceDay=isoSource||(brazilianSource
    ?brazilianSource[3]+"-"+brazilianSource[2]+"-"+brazilianSource[1]:date);
  const dayFromValue=/^(\d{4}-\d{2}-\d{2})[T ]/.exec(inputTime)?.[1] || sourceDay;
  const clockMatch=/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$|[Z+-])/.exec(inputTime)
    || /^(\d{1,2}):(\d{2})$/.exec(String(clock||"").trim());
  const formattedClock = clockMatch && Number(clockMatch[1])<24 && Number(clockMatch[2])<60
    ? clockMatch[1].padStart(2,"0")+":"+clockMatch[2] : "A confirmar";
  const when=absolute||{iso:"",day:dayFromValue,time:formattedClock};
  const id = String(pick(record,"id","jogo_id","match_id")||[date,home,away,index].join(":"));
  const rawStatus=pick(record,"status","situacao","state","match_status");
  const status=typeof rawStatus==="string"?rawStatus:String(pick(rawStatus,"nome","name","slug")||"");
  const score=pick(record,"placar","score","resultado");
  const homeScore=pick(record,"placar_mandante","placar_casa","home_score","score_home") ??
    pick(score,"mandante","casa","home","home_score");
  const awayScore=pick(record,"placar_visitante","placar_fora","away_score","score_away") ??
    pick(score,"visitante","fora","away","away_score");
  const finished=/encerrado|finaliz|finished|concluid|ft|ended/i.test(status);
  const scoreLabel=finished&&homeScore!=null&&awayScore!=null?
    String(homeScore)+" × "+String(awayScore):"";
  const player = pick(record,"jogador_destaque","jogador","featured_player");
  const playerPhoto = teamLogo({image:pick(player,"foto","imagem","image","photo")});
  return {id,home,away,homeId:"",awayId:"",homeBadge:matchBadge(record,homeObj,"home"),awayBadge:matchBadge(record,awayObj,"away"),
    league,leagueId:simplify(league),...when,broadcasts:extractFtwbBroadcasts(record),
    playerPhoto,playerName:playerPhoto ? teamName(player) : "",status,scoreLabel};
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
    // The supplied FTWB /jogos API is the sole source of match information.
    const loadFixtures=async(status?:string):Promise<{items:unknown[];fields:string[]}>=>{
      const url=new URL(FOOTBALL_API_URL);
      url.searchParams.set("data",data.date);
      if(status)url.searchParams.set("status",status);
      const response=await fetch(url,{
        headers:{"x-api-key":key,Accept:"application/json"},
        signal:AbortSignal.timeout(12000),cache:"no-store"
      });
      if(!response.ok)throw new Error("FTWB respondeu HTTP "+response.status);
      const payload:unknown=await response.json();
      const list=Array.isArray(payload)?payload:pick(payload,"jogos","data","results","partidas","events","matches");
      const items=Array.isArray(list)?list:pick(list,"jogos","matches","data");
      if(!Array.isArray(items))throw new Error("A resposta FTWB não contém uma lista de jogos.");
      const first=items.find(item=>item&&typeof item==="object");
      return {items,fields:first?Object.keys(first):[]};
    };
    // FTWB documents multiple statuses and combined filters; no country restriction.
    const queries=await Promise.allSettled([
      loadFixtures("agendado,ao_vivo,encerrado,adiado,cancelado"),
      loadFixtures("encerrado"),
      loadFixtures()
    ]);
    const successful=queries.filter((result):result is PromiseFulfilledResult<{
      items:unknown[];fields:string[];
    }>=>result.status==="fulfilled");
    if(!successful.length)throw new Error("Não foi possível consultar jogos na FTWB.");
    const records=successful.flatMap(result=>result.value.items);
    const fields=[...new Set(successful.flatMap(result=>result.value.fields))].slice(0,60);
    const candidates=records.map((record,index)=>apiFixture(record,index,data.date))
      .filter((match):match is FootballMatch=>match!==null)
      .filter(match=>match.day===data.date && isMajorFootballCompetition(match.league) &&
        !isYouthFootballFixture(match.league,match.home,match.away));
    const unique=new Map<string,FootballMatch>();
    const completeness=(match:FootballMatch)=>Number(Boolean(match.homeBadge))+
      Number(Boolean(match.awayBadge))+(match.broadcasts?.length||0)*3+
      Number(/^\d{2}:\d{2}$/.test(match.time));
    // Multiple status queries may return the same game; keep the richest FTWB row.
    for(const match of candidates){
      const id=[simplify(match.home),simplify(match.away),match.day].join("|");
      const old=unique.get(id);
      if(!old||completeness(match)>completeness(old))unique.set(id,match);
    }
    const matches=[...unique.values()];
    // Only TV channels may come from Cloudflare when FTWB does not specify them.
    // All fixture dates, team names, times and crests remain exactly as returned by FTWB.
    const missingChannels=matches.filter(m=>!m.broadcasts?.length);
    const auth=getRequest()?.headers.get("authorization")||"";
    const apikey=process.env.SUPABASE_PUBLISHABLE_KEY||"";
    if(missingChannels.length && auth.startsWith("Bearer ") && apikey){
      try{
        // ONE POST per screen refresh; the Cloudflare Worker runs at most ONE AI inference
        // for the batch and caches channels by fixture/date in KV.
        const response=await fetch(
          "https://streammonitor-football-broadcast.victorsampaio133.workers.dev/broadcasts",{
            method:"POST",
            headers:{authorization:auth,apikey,"content-type":"application/json"},
            body:JSON.stringify({matches:missingChannels.slice(0,64).map(m=>({
              id:m.id,home:m.home,away:m.away,date:m.day
            }))}),
            cache:"no-store",signal:AbortSignal.timeout(25000)
          }
        );
        if(!response.ok){
          console.warn("[Vitrine Futebol] Cloudflare channel lookup HTTP",response.status);
        }else{
          const data=await response.json() as {results?:Array<{
            id:string;channels?:string[];verified?:boolean
          }>};
          const confirmed=new Map((Array.isArray(data.results)?data.results:[])
            .filter(row=>row?.verified===true && Array.isArray(row.channels))
            .map(row=>[row.id,[...new Set(row.channels!.filter(name=>
              typeof name==="string"&&name.trim()))].slice(0,3)]));
          for(const match of missingChannels){
            const tv=confirmed.get(match.id);
            if(tv?.length)match.broadcasts=tv;
          }
        }
      }catch(error){
        // Only the channel lookup fails; do not block FTWB matches or expose credentials.
        console.warn("[Vitrine Futebol] Cloudflare channel lookup unavailable",
          error instanceof Error?error.name:"unknown");
      }
    }
    const leaguePriority=(name:string)=>{
      const league=simplify(name);
      if(/brasileir|copa do brasil/.test(league))return 0;
      if(/libertadores|sul americana|sudamericana/.test(league))return 1;
      if(/champions league|liga dos campeoes/.test(league))return 2;
      if(/europa league|conference league|uefa/.test(league))return 3;
      if(/nations league|liga das nacoes/.test(league))return 4;
      return 5;
    };
    matches.sort((a,b)=>
      Number(!(a.broadcasts?.length))-Number(!(b.broadcasts?.length))||
      leaguePriority(a.league)-leaguePriority(b.league)||
      a.time.localeCompare(b.time));
    return {
      matches,leagues:footballLeagueOptions,source:"FTWB",
      partial:successful.length<queries.length,sourcesSucceeded:successful.length,
      queriedDate:data.date,checkedAt:new Date().toISOString(),
      timeZone:"America/Fortaleza",
      fixtureCount:matches.length,providerRecords:records.length,
      providerFields:fields,
      withoutBroadcast:matches.filter(m=>!m.broadcasts?.length).length,
      missingBadges:matches.filter(m=>!m.homeBadge||!m.awayBadge).length,
      missingKickoff:matches.filter(m=>!/^\d{2}:\d{2}$/.test(m.time)).length
    };
  });

/** Player images from other providers may require permission for commercial use. */
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
