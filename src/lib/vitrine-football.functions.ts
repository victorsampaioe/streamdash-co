import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidFeature } from "@/lib/premium-feature-access";
import { isMajorFootballCompetition, isYouthFootballFixture } from "@/lib/vitrine-football-competitions";

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
const MAIN_TEAMS = ["flamengo", "corinthians", "palmeiras", "sao paulo", "santos", "vasco", "fluminense", "botafogo", "gremio", "internacional", "atletico mg", "atletico mineiro", "cruzeiro", "bahia", "vitoria", "fortaleza", "ceara", "sport recife", "sport club do recife", "sport", "athletico", "atletico pr", "coritiba", "parana clube", "bragantino", "chapecoense", "goias", "america mg", "juventude"];
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
    // Browsers refuse mixed-content images; try secure transport for HTTP image URLs.
    if(parsed.protocol==="http:")parsed.protocol="https:";
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
function getBroadcasts(record: unknown): string[] {
  let raw = pick(record,"canais","transmissoes","transmissao","onde_assistir","broadcast","tv","tvNetworks","ondeAssistir","broadcasts","streaming","transmission");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = pick(raw,"canais","channels");
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;|]/) : [];
  return [...new Set(list.map((item) => typeof item === "string" ? item :
    String(pick(item,"nome","name","canal") || "")).map((value) => value.trim()).filter(Boolean))].slice(0,3);
}
/**
 * Schedule-specific editorial verification for the 16 Nov 2026 Copa Paraná final.
 * Do not infer channels for other matches. Sources checked:
 * ge.globo.com/pr/futebol/noticia/2026/11/16/athletico-x-parana-clube-pela-final-da-copa-parana-onde-assistir-ao-vivo-horario-e-escalacoes.ghtml
 * parana.pr.gov.br/aen/Noticia/TV-Parana-Turismo-transmite-para-todo-o-Brasil-finais-da-Copa-Parana
 */
function verifiedBroadcasts(match:FootballMatch, date:string):string[]{
  const h=simplify(match.home),a=simplify(match.away);
  const isAthletico=(v:string)=>v.includes("athletico")||v.includes("atletico pr")||v.includes("atletico paranaense");
  const isParana=(v:string)=>(v==="parana"||v.includes("parana clube"))&&!isAthletico(v);
  if(date==="2026-11-16" && ((isAthletico(h)&&isParana(a))||(isAthletico(a)&&isParana(h)))) {
    return ["FPF TV","Rede Furacão","TMC Esporte"];
  }
  return [];
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
  const inputTime = String(dateTime||clock||"").trim();
  const timeWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(inputTime);
  const absolute = timeWithZone && !Number.isNaN(Date.parse(inputTime))
    ? kickoff(inputTime) : null;
  const dayFromValue=/^(\d{4}-\d{2}-\d{2})[T ]/.exec(inputTime)?.[1] || date;
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
    league,leagueId:simplify(league),...when,broadcasts:getBroadcasts(record),
    playerPhoto,playerName:playerPhoto ? teamName(player) : "",status,scoreLabel};
}
// Compare full normalized words: "Sport" must not match "Sportivo Barracas".
const clubMatches=(name:string,club:string)=>(" "+simplify(name)+" ").includes(" "+club+" ");
function importantBrazilianMatch(match:FootballMatch):boolean{
  const home=simplify(match.home),away=simplify(match.away);
  if(MAIN_TEAMS.some(team=>clubMatches(home,team)||clubMatches(away,team)))return true;
  // Include relevant national competitions even without a listed major club.
  const league=simplify(match.league);
  return /brasileir|serie a|serie b|copa do brasil|copa parana|copa nordeste|copa verde|libertadores|sul americana/.test(league) &&
    !/argentin|rosario|colombia|uruguai|mexic|espan|italian/.test(league);
}

// Artwork badges: prefer the actual FTWB image. Use verified sources only when FTWB omitted it.
// These specific known club crests are a last-resort fallback, not generated artwork.
const VERIFIED_BADGES:Record<string,string>={
  "athletico pr":"https://www.zerozero.pt/img/logos/equipas/2230_imgbank_1683626334.png",
  "athletico paranaense":"https://www.zerozero.pt/img/logos/equipas/2230_imgbank_1683626334.png",
  "parana":"https://www.futbox.com/img/v1/529/eb5/159/002/84bf7f2e5d9223114251_zoom.png",
  "parana clube":"https://www.futbox.com/img/v1/529/eb5/159/002/84bf7f2e5d9223114251_zoom.png",
};
type RemoteTeam={name?:string;nome?:string;logo?:string;image?:string;escudo?:string;team?:{name?:string;logo?:string}};
const NATIONAL_FLAGS:Record<string,string>={
  "brasil":"br","peru":"pe","alemanha":"de","paises baixos":"nl","holanda":"nl",
  "grecia":"gr","servia":"rs","suica":"ch","eslovaquia":"sk","cazaquistao":"kz",
  "ilhas faroe":"fo","moldavia":"md","estonia":"ee","bulgaria":"bg",
  "lituania":"lt","liechtenstein":"li","islandia":"is","luxemburgo":"lu",
  "gibraltar":"gi","malta":"mt","macedonia do norte":"mk","eslovenia":"si",
  "andorra":"ad","azerbaijao":"az","franca":"fr","espanha":"es",
  "portugal":"pt","italia":"it","uruguai":"uy","argentina":"ar",
  "belgica":"be","escocia":"gb-sct"
};
const badgeCache=new Map<string,{expires:number,url:string}>();
async function findTeamBadge(name:string):Promise<string>{
  const normalized=simplify(name);
  const known=VERIFIED_BADGES[normalized];
  if(known)return known;
  // National teams use their country's flag if the FTWB does not supply a crest.
  if(NATIONAL_FLAGS[normalized])return "https://flagcdn.com/w80/"+NATIONAL_FLAGS[normalized]+".png";
  const cached=badgeCache.get(normalized);
  if(cached && cached.expires>Date.now())return cached.url;
  let logo="";
  try{
    const search=new URL(API_BASE+"/search/");
    search.searchParams.set("q",name);
    search.searchParams.set("sport","football");
    search.searchParams.set("limit","15");
    const response=await fetch(search,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(3500)});
    if(response.ok){
      const payload:unknown=await response.json();
      const list=pick(payload,"teams","clubs","equipes","times","results");
      if(Array.isArray(list)){
        const club=list.find((raw:RemoteTeam)=>{
          const candidate=simplify(raw.name||raw.nome||raw.team?.name);
          return candidate===normalized;
        }) as RemoteTeam|undefined;
        if(club)logo=teamLogo({image:club.logo||club.image||club.escudo||club.team?.logo});
      }
    }
  }catch{/* Missing badge lookup must not hide the fixture. */}
  badgeCache.set(normalized,{expires:Date.now()+60*60_000,url:logo});
  return logo;
}

/**
 * ESPN publishes a catalog of team records by competition, including logo
 * URLs. Fetch a relevant league only when a selected game lacks its crest,
 * and match team names exactly to avoid wrong badges.
 */
type EspnTeam = {displayName?:string;name?:string;shortDisplayName?:string;abbreviation?:string;
  logos?:Array<{href?:string}>;logo?:string;};
const espnCatalog=new Map<string,{expires:number,teams:EspnTeam[]}>();
function espnLeagueSlugs(league:string):string[]{
  const name=simplify(league);
  if(/copa do brasil/.test(name))return ["bra.1","bra.2"];
  if(/brasileirao|campeonato brasileiro|brasil serie/.test(name))return /serie b/.test(name)?["bra.2"]:["bra.1"];
  if(/libertadores/.test(name))return ["conmebol.libertadores","bra.1"];
  if(/sul ?americana|sudamericana/.test(name))return ["conmebol.sudamericana","bra.1"];
  if(/nations league|liga das nacoes/.test(name))return ["uefa.nations"];
  if(/copa america/.test(name))return ["conmebol.america"];
  if(/copa do mundo|world cup/.test(name))return ["fifa.world"];
  if(/eliminatorias/.test(name))return ["fifa.worldq"];
  if(/club world cup|mundial de clubes/.test(name))return ["fifa.cwc"];
  if(/champions league|liga dos campeoes/.test(name))return ["uefa.champions"];
  if(/europa league/.test(name))return ["uefa.europa"];
  if(/conference league/.test(name))return ["uefa.europa.conf"];
  if(/premier league/.test(name))return ["eng.1"];
  if(/la liga|laliga/.test(name))return ["esp.1"];
  if(/bundesliga/.test(name))return ["ger.1"];
  if(/serie a|italian/.test(name))return ["bra.1","ita.1"];
  if(/serie b/.test(name))return ["bra.2"];
  if(/ligue 1/.test(name))return ["fra.1"];
  if(/liga portugal|primeira liga/.test(name))return ["por.1"];
  if(/liga profesional|primera division argentina/.test(name))return ["arg.1"];
  if(/\bmls\b|major league soccer/.test(name))return ["usa.1"];
  return [];
}
function normalizeClubName(name:string):string{
  let n=simplify(name).replace(/\b(futebol clube|futbol club|football club|esporte clube|sport club|fc|sc|ec)\b/g,"")
    .replace(/\s+/g," ").trim();
  const aliases:Record<string,string>={
    "athletico pr":"athletico paranaense","atletico paranaense":"athletico paranaense",
    "parana":"parana clube","parana clube":"parana clube",
    "internacional rs":"internacional","inter porto alegre":"internacional",
    "atletico mg":"atletico mineiro","galo":"atletico mineiro",
    "sao paulo sp":"sao paulo","gremio rs":"gremio",
    "red bull bragantino":"bragantino","rb bragantino":"bragantino",
    "man united":"manchester united","man city":"manchester city",
    "psg":"paris saint germain","bayern munich":"bayern munchen",
  };
  return aliases[n]||n;
}
function espnBadge(team:EspnTeam):string{
  const url=team.logos?.find(item=>typeof item.href==="string")?.href||team.logo||"";
  try{
    const parsed=new URL(url);
    return parsed.protocol==="https:" && parsed.hostname==="a.espncdn.com" ? parsed.toString() : "";
  }catch{return ""}
}
async function loadEspnCatalog(slug:string):Promise<EspnTeam[]>{
  const cached=espnCatalog.get(slug);
  if(cached && cached.expires>Date.now())return cached.teams;
  let teams:EspnTeam[]=[];
  try{
    const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+slug+"/teams?limit=150";
    const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(4500)});
    if(response.ok){
      const data:unknown=await response.json();
      const sports=pick(data,"sports");
      const leagues=Array.isArray(sports)?sports.flatMap(s=>Array.isArray(pick(s,"leagues"))?pick(s,"leagues") as unknown[]:[]):[];
      const entries=leagues.flatMap(l=>Array.isArray(pick(l,"teams"))?pick(l,"teams") as unknown[]:[]);
      const alternative=pick(data,"teams");
      const rows=entries.length?entries:Array.isArray(alternative)?alternative:[];
      teams=rows.map(row=>(pick(row,"team")||row) as EspnTeam).filter(team=>Boolean(team.displayName||team.name));
    }
  }catch{/* Optional crest lookup must never break matches. */}
  espnCatalog.set(slug,{expires:Date.now()+3*60*60_000,teams});
  return teams;
}
async function attachEspnBadges(matches:FootballMatch[]):Promise<void>{
  const missing=matches.filter(match=>!match.homeBadge||!match.awayBadge);
  if(!missing.length)return;
  const slugs=[...new Set(missing.flatMap(match=>espnLeagueSlugs(match.league)))].slice(0,10);
  if(!slugs.length)return;
  const catalogs=new Map(await Promise.all(slugs.map(async slug=>[slug,await loadEspnCatalog(slug)] as const)));
  for(const match of missing){
    const candidates=espnLeagueSlugs(match.league).flatMap(slug=>catalogs.get(slug)||[]);
    const resolve=(name:string):string=>{
      const target=normalizeClubName(name);
      for(const team of candidates){
        if([team.displayName,team.name,team.shortDisplayName]
          .filter((v):v is string=>!!v)
          .some(v=>normalizeClubName(v)===target))return espnBadge(team);
      }
      return "";
    };
    if(!match.homeBadge)match.homeBadge=resolve(match.home);
    if(!match.awayBadge)match.awayBadge=resolve(match.away);
  }
}

async function enrichBadges(matches:FootballMatch[]):Promise<void>{
  const names=[...new Set(matches.flatMap(m=>[!m.homeBadge?m.home:"",!m.awayBadge?m.away:""]).filter(Boolean))].slice(0,16);
  // Limit network fanout for busy fixture days.
  for(let i=0;i<names.length;i+=6){
    const slice=names.slice(i,i+6);
    const images=await Promise.all(slice.map(async name=>[name,await findTeamBadge(name)] as const));
    const map=new Map(images);
    for(const m of matches){
      if(!m.homeBadge)m.homeBadge=map.get(m.home)||"";
      if(!m.awayBadge)m.awayBadge=map.get(m.away)||"";
    }
  }
}

/**
 * Small, allowlisted logo images are converted to data URLs on the server.
 * This avoids CORS/hotlink failures when exporting the final PNG.
 * No arbitrary FTWB-provided destination is fetched here.
 */
const badgeDataCache=new Map<string,{expires:number,value:string}>();
async function inlineTrustedBadge(url:string):Promise<string>{
  const cached=badgeDataCache.get(url);
  if(cached&&cached.expires>Date.now())return cached.value;
  let value=url;
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=="https:"||parsed.port||parsed.username||parsed.password ||
      !["www.zerozero.pt","www.futbox.com","img.thesports.com","flagcdn.com","a.espncdn.com"].includes(parsed.hostname))return url;
    const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(3000)});
    const mime=response.headers.get("content-type")?.split(";")[0]||"";
    if(response.ok && ["image/png","image/jpeg","image/webp"].includes(mime)&&
       Number(response.headers.get("content-length")||"0")<=600_000){
      const body=await response.arrayBuffer();
      if(body.byteLength<=600_000)value="data:"+mime+";base64,"+Buffer.from(body).toString("base64");
    }
  }catch{/* Use original HTTPS URL when the allowed image CDN cannot be reached. */}
  badgeDataCache.set(url,{expires:Date.now()+60*60_000,value});
  return value;
}
async function inlinePosterBadges(matches:FootballMatch[]):Promise<void>{
  const urls=[...new Set(matches.flatMap(m=>[m.homeBadge,m.awayBadge]).filter(Boolean))]
    .filter(url=>{try{return ["www.zerozero.pt","www.futbox.com","img.thesports.com","a.espncdn.com","flagcdn.com"].includes(new URL(url).hostname)}catch{return false}})
    .slice(0,32);
  const entries=await Promise.all(urls.map(async url=>[url,await inlineTrustedBadge(url)] as const));
  const mapped=new Map(entries);
  for(const match of matches){
    match.homeBadge=mapped.get(match.homeBadge)||match.homeBadge;
    match.awayBadge=mapped.get(match.awayBadge)||match.awayBadge;
  }
}


/** Major international fixtures are relevant even when neither team is Brazilian.
 * Low-tier unrelated competitions should not fill a reseller banner by accident.
 */
const GLOBAL_COMPETITIONS=[
  "liga das nacoes","nations league","uefa","eliminatorias","world cup",
  "copa do mundo","champions league","liga dos campeoes","libertadores",
  "sul americana","sudamericana","premier league","bundesliga","la liga",
  "serie a italiana","liga portugal","amistosos internacionais",
  "amistoso internacional","amistoso sub 20","international friendly",
  "copa intercontinental","concacaf","campeonato uruguaio"
];
const WORLD_TEAMS=["brasil","alemanha","paises baixos","holanda","franca","espanha",
  "inglaterra","italia","portugal","argentina","uruguai","belgica","suica",
  "escocia","servia","grecia","japao","colombia","estados unidos"];
function relevantWorldFixture(raw:unknown):boolean{
  const nested=pick(raw,"times","equipes","teams");
  const home=teamName(pick(raw,"mandante","time_casa","home_team","casa","home","teamHome")
    ??pick(nested,"mandante","casa","home"));
  const away=teamName(pick(raw,"visitante","time_fora","away_team","fora","away","teamAway")
    ??pick(nested,"visitante","fora","away"));
  if(MAIN_TEAMS.some(club=>clubMatches(home,club)||clubMatches(away,club)))return true;
  const competition=pick(raw,"campeonato","competicao","league","competition");
  const league=simplify(typeof competition==="string"?competition:pick(competition,"nome","name","title"));
  if(GLOBAL_COMPETITIONS.some(term=>league.includes(term)))return true;
  return isMajorFootballCompetition(league);
}

/** Look up a real portrait using the previous sports player search. Never fabricate a player. */
const PLAYER_HINTS: Array<{team:string;name:string}> = [
  {team:"flamengo",name:"Pedro"}, {team:"corinthians",name:"Yuri Alberto"},
  {team:"palmeiras",name:"Raphael Veiga"}, {team:"sao paulo",name:"Lucas Moura"},
  {team:"santos",name:"Neymar"}, {team:"vasco",name:"Philippe Coutinho"},
  {team:"fluminense",name:"German Cano"}, {team:"gremio",name:"Cristaldo"},
  {team:"internacional",name:"Alan Patrick"}, {team:"cruzeiro",name:"Matheus Pereira"},
  {team:"bahia",name:"Everton Ribeiro"}, {team:"botafogo",name:"Marlon Freitas"},
];
const imageCache=new Map<string,{expires:number;photo:string;name:string}>();
async function findHighlight(group:FootballMatch[]):Promise<{photo:string;name:string}|null>{
  const winner=PLAYER_HINTS.find(({team})=>group.some(m=>simplify(m.home).includes(team)||simplify(m.away).includes(team)));
  if(!winner)return null;
  const cached=imageCache.get(winner.team);
  if(cached&&cached.expires>Date.now())return cached.photo?cached:null;
  let found:{photo:string;name:string}={photo:"",name:""};
  try{
    const query=new URLSearchParams({q:winner.name,sport:"football",limit:"15"});
    const response=await getJson<{players?:RemotePlayer[]}>("/search/?"+query.toString());
    for(const player of response.players||[]){
      const name=String(player.name||"");
      if(simplify(name)!==simplify(winner.name))continue;
      const team=player.team_name||(typeof player.team==="string"?player.team:player.team?.name)||(typeof player.club==="string"?player.club:player.club?.name)||"";
      if(team && !simplify(team).includes(winner.team))continue;
      const photo=teamLogo({image:player.logo});
      if(!photo || new URL(photo).hostname!=="img.thesports.com")continue;
      found={photo,name};break;
    }
  }catch{/* Missing portraits do not break the match list. */}
  imageCache.set(winner.team,{...found,expires:Date.now()+60*60_000});
  return found.photo?found:null;
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
    // Some FTWB configurations return only upcoming games when status is absent.
    // Combine explicit status groups to retrieve already completed fixtures too.
    const loadFixtures=async(country?:string,status?:string):Promise<unknown[]>=>{
      const url=new URL(FOOTBALL_API_URL);
      url.searchParams.set("data",data.date);
      if(country)url.searchParams.set("pais",country);
      if(status)url.searchParams.set("status",status);
      const response=await fetch(url,{
        headers:{"x-api-key":key,Accept:"application/json"},
        signal:AbortSignal.timeout(9000),cache:"no-store"
      });
      if(!response.ok)throw new Error("FTWB respondeu HTTP "+response.status);
      const payload:unknown=await response.json();
      const list=Array.isArray(payload)?payload:pick(payload,"jogos","data","results","partidas","events","matches");
      const nestedList=Array.isArray(list)?list:pick(list,"jogos","matches","data");
      if(!Array.isArray(nestedList))throw new Error("Formato dos jogos FTWB não reconhecido.");
      return nestedList;
    };
    const schedules=await Promise.allSettled([
      loadFixtures("brasil","agendado,ao_vivo,encerrado,adiado,cancelado"),
      loadFixtures("brasil","encerrado"),
      loadFixtures("brasil","ao_vivo"),
      loadFixtures("brasil")
    ]);
    const successful=schedules.filter((entry):entry is PromiseFulfilledResult<unknown[]>=>entry.status==="fulfilled");
    if(!successful.length)throw new Error("Não foi possível consultar os jogos da FTWB em nenhum status.");
    const national=successful.flatMap(entry=>entry.value);
    let all:unknown[]=[...national];
    // The global feed is essential on international-match days (e.g. UEFA Nations League).
    // Fetch finished games separately because the provider can default to upcoming games.
    const worldQueries=await Promise.allSettled([
      loadFixtures(undefined,"agendado,ao_vivo,encerrado,adiado,cancelado"),
      loadFixtures(undefined,"encerrado"),
      loadFixtures()
    ]);
    for(const entry of worldQueries){
      if(entry.status==="fulfilled")all.push(...entry.value.filter(relevantWorldFixture));
    }
    const seen=new Set<string>();
    const matches=all.map((raw,i)=>apiFixture(raw,i,data.date))
      .filter((match):match is FootballMatch=>!!match && match.day===data.date && isMajorFootballCompetition(match.league) && !isYouthFootballFixture(match.league,match.home,match.away))
      .filter((match)=>{
        const unique=[simplify(match.home),simplify(match.away),match.day].join("|");
        if(seen.has(unique))return false;seen.add(unique);return true;
      }).sort((a,b)=>{
        const rank=(m:FootballMatch)=>{
          const idx=MAIN_TEAMS.findIndex(club=>clubMatches(m.home,club)||clubMatches(m.away,club));
          if(idx>=0)return idx;
          const league=simplify(m.league);
          if(league.includes("nations league")||league.includes("liga das nacoes"))return 40;
          if(WORLD_TEAMS.some(team=>clubMatches(m.home,team)||clubMatches(m.away,team)))return 45;
          return MAIN_TEAMS.length+50;
        };
        return rank(a)-rank(b)||a.time.localeCompare(b.time);
      });
    // Enrich shields before returning the match list; no bogus placeholders.
    await attachEspnBadges(matches);
    await enrichBadges(matches);
    await inlinePosterBadges(matches);
    // Retain FTWB channels and previously checked event-specific information first.
    for(const match of matches){
      if(!(match.broadcasts||[]).length)match.broadcasts=verifiedBroadcasts(match,data.date);
    }
    const withoutChannels=matches.filter(match=>!(match.broadcasts||[]).length);
    const authorization=getRequest()?.headers.get("authorization")||"";
    const publicKey=process.env.SUPABASE_PUBLISHABLE_KEY||"";
    // ONE HTTP request -> ONE AI inference at most, for all eligible missing games.
    if(withoutChannels.length && authorization.startsWith("Bearer ") && publicKey){
      try{
        const response=await fetch(
          "https://streammonitor-football-broadcast.victorsampaio133.workers.dev/broadcasts",{
          method:"POST",
          headers:{authorization,apikey:publicKey,"content-type":"application/json"},
          body:JSON.stringify({matches:withoutChannels.slice(0,64)
            .map(m=>({id:m.id,home:m.home,away:m.away,date:m.day}))}),
          cache:"no-store",signal:AbortSignal.timeout(25000)
        });
        if(response.ok){
          const payload=await response.json() as {results?:Array<{id:string;channels?:string[]}>};
          const records=Array.isArray(payload.results)?payload.results:[];
          const found=new Map(records.filter(item=>typeof item.id==="string"&&
            Array.isArray(item.channels))
            .map(item=>[item.id,Array.from(new Set(item.channels!.filter(channel=>
              typeof channel==="string"&&channel.trim().length>0))).slice(0,3)]));
          for(const match of withoutChannels){
            const channels=found.get(match.id);
            if(channels?.length)match.broadcasts=channels;
          }
        }
      }catch{/* News/AI downtime must never block the poster generation. */}
    }
    // Put real broadcast events and the major competitions first within the same day.
    // Keep matches without available broadcasts; they will display "Sem transmissão".
    const competitionPriority=(name:string)=>{
      const league=simplify(name);
      if(/copa do brasil|brasileir|campeonato brasileiro/.test(league))return 0;
      if(/libertadores|sul americana|sudamericana/.test(league))return 1;
      if(/champions league|liga dos campeoes/.test(league))return 2;
      if(/uefa|europa league|conference league/.test(league))return 3;
      if(/nations league|liga das nacoes/.test(league))return 4;
      return 5;
    };
    const teamPriority=(match:FootballMatch)=>{
      const main=MAIN_TEAMS.findIndex(team=>clubMatches(match.home,team)||clubMatches(match.away,team));
      if(main>=0)return main;
      const international=WORLD_TEAMS.findIndex(team=>
        clubMatches(match.home,team)||clubMatches(match.away,team));
      return international>=0?50+international:100;
    };
    matches.sort((a,b)=>{
      const aShown=(a.broadcasts||[]).length?0:1;
      const bShown=(b.broadcasts||[]).length?0:1;
      return aShown-bShown||competitionPriority(a.league)-competitionPriority(b.league)||
        teamPriority(a)-teamPriority(b)||a.time.localeCompare(b.time);
    });
    for(let index=0;index<matches.length;index+=4){
      const group=matches.slice(index,index+4);
      if(group.some(match=>!!match.playerPhoto))continue;
      const featured=await findHighlight(group);
      if(featured)matches[index]={...matches[index],playerPhoto:featured.photo,playerName:featured.name};
    }
    return {matches,leagues:footballLeagueOptions,source:"FTWB",partial:false,sourcesSucceeded:1,fixtureCount:matches.length,missingBadges:matches.filter(m=>!m.homeBadge||!m.awayBadge).length};
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
