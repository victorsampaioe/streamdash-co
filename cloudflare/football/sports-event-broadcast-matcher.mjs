/**
 * Metadata-only sports event cross-check. Never reads or stores embed_url,
 * streams, access tokens, or IPTV customer credentials.
 * A fixture's actual date, both team names and kickoff must agree before
 * accepting any broadcaster label. Source provides leads, not official TV rights.
 */
const ROOT = "https://api.reidoscanais.im";
const normalize = (s) => String(s ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();
const aliases = new Map(Object.entries({
  "athletico pr": "athletico paranaense",
  "atletico pr": "athletico paranaense",
  "athletico paranaense": "athletico paranaense",
  "atletico go": "atletico goianiense",
  "atletico goianiense": "atletico goianiense",
  "rb bragantino": "bragantino",
  "red bull bragantino": "bragantino",
  "bragantino": "bragantino",
  "vasco da gama": "vasco",
  "cr vasco da gama": "vasco",
  "vasco": "vasco",
  "gremio fbpa": "gremio",
  "flamengo rj": "flamengo",
  "sao paulo fc": "sao paulo",
  "sao paulo": "sao paulo",
  "fluminense fc": "fluminense",
  "fluminense": "fluminense",
  "botafogo rj": "botafogo",
  "sport club do recife": "sport recife",
  "sport recife": "sport recife",
  "criciuma ec": "criciuma",
  "fortaleza ec": "fortaleza",
  "goias ec": "goias",
  "brasil": "brasil",
  "brazil": "brasil",
  "netherlands": "paises baixos",
  "holanda": "paises baixos",
  "paises baixos": "paises baixos",
  "germany": "alemanha",
  "alemanha": "alemanha"
}));
const canonical = (name) => aliases.get(normalize(name)) || normalize(name);
const invalidYouth = (value) => /(?:^|\s)(?:sub\s?(?:17|18|19|20|21|23)|u\s?(?:17|18|19|20|21|23)|junior(?:es)?|under\s?(?:17|18|19|20|21|23))(?:\s|$)/.test(normalize(value));
const providers = [
  ["Premiere", /^premiere(?:\s*(?:clubes|hd|1))?$/], ["Premiere 2", /^premiere\s*2$/],
  ["Premiere 3", /^premiere\s*3$/],
  ["SporTV", /^sportv(?:\s*(?:hd|1))?$/], ["SporTV 2", /^sportv\s*2(?:\s*hd)?$/],
  ["SporTV 3", /^sportv\s*3(?:\s*hd)?$/],
  ["Globo", /^(?:globo(?:\s*(?:tv|sp|rj|mg))?|rede globo)$/],
  ["ESPN", /^espn(?:\s*(?:1|hd))?$/], ["ESPN 2", /^espn\s*2(?:\s*hd)?$/],
  ["ESPN 3", /^espn\s*3(?:\s*hd)?$/], ["ESPN 4", /^espn\s*4(?:\s*hd)?$/],
  ["Disney+", /^disney(?:\s*plus)?$/], ["CazéTV", /^caze(?:\s*tv)?$/],
  ["ge tv", /^ge\s*tv$/], ["TNT Sports", /^tnt(?:\s*sports)?$/],
  ["SBT", /^sbt(?:\s*hd)?$/], ["Band", /^(?:band|rede band|tv band)$/],
  ["BandSports", /^bandsports?$/], ["Record", /^(?:record(?:\s*tv)?|rede record)$/],
  ["Prime Video", /^(?:prime video|amazon prime video)$/],
  ["GOAT", /^(?:goat|canal goat)$/], ["DAZN", /^dazn$/],
  ["Max", /^(?:hbo\s*max|max)$/], ["Apple TV", /^(?:apple tv|apple tv plus)$/],
  ["FIFA+", /^fifa(?:\s*plus)?$/], ["NSports", /^nsports?$/],
  ["Paramount+", /^paramount(?:\s*plus)?$/]
];
function channelName(value) {
 const label = normalize(value).replace(/\s+(?:alternativo|alternativa|backup|reserva)(?:\s+\d+)?$/, "");
 if (!label || label.length > 70 ||
  /servidor|server|player|embed|stream|alternativ|link|fonte|op[cç][aã]o|espelho|backup|canal \d/.test(label))
  return null;
 for(const [name,regex] of providers)if(regex.test(label))return name;
 return null;
}
function sourceDayAndMinutes(record) {
 const raw = String(record?.start_time ?? "").trim();
 const parsed = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
 if(!parsed)return null;
 const day=parsed[1],hours=Number(parsed[2]),minutes=Number(parsed[3]);
 if(hours>23||minutes>59||Number.isNaN(Date.parse(day+"T12:00:00Z")))return null;
 // Do not trust data that contradicts its own Unix timestamp.
 if(record.start_timestamp!==undefined&&record.start_timestamp!==null){
  const stamp=Number(record.start_timestamp);
  if(!Number.isSafeInteger(stamp)||stamp<1e9||stamp>5e9)return null;
  const eventUtc=Date.parse(day+"T"+String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":00-03:00");
  if(!Number.isFinite(eventUtc)||Math.abs(eventUtc-stamp*1000)>90*60000)return null;
 }
 return {day,minutes:hours*60+minutes};
}
function leagueGroup(text){
 const s=normalize(text);
 if(/sub\s?(?:17|18|19|20|21|23)|junior/.test(s))return "youth";
 if(/(?:brasileir|campeonato brasileiro)/.test(s)){
  if(/serie b|\bserie 2\b/.test(s))return "brasileirao-b";
  if(/serie a|\bserie 1\b/.test(s))return "brasileirao-a";
  return "brasileirao";
 }
 if(/copa do brasil/.test(s))return "copa-brasil";
 if(/libertadores/.test(s))return "libertadores";
 if(/sul americana|sudamericana/.test(s))return "sulamericana";
 if(/champions/.test(s))return "champions";
 if(/premier league/.test(s))return "premier-league";
 if(/liga 1|ligue 1/.test(s))return "ligue1";
 if(/amistoso|friendly/.test(s))return "friendly";
 return "";
}
export function matchBroadcastsFromSports(matches,events){
 const result=new Map();
 if(!Array.isArray(matches)||!Array.isArray(events))return result;
 for(const fixture of matches){
  if(!fixture||!fixture.home||!fixture.away||!fixture.date||invalidYouth(fixture.home+" "+fixture.away+" "+(fixture.league||"")))continue;
  const h=canonical(fixture.home),a=canonical(fixture.away);
  if(!h||!a||h===a)continue;
  const wantedGroup=leagueGroup(fixture.league);
  const candidates=[];
  for(const item of events.slice(0,2500)){
   if(!item||typeof item!=="object"||invalidYouth(String(item.title||"")+" "+String(item.competition||"")))continue;
   // Live feed sometimes omits 'teams' even though the public docs show it.
   // An anchored 'A x B' title is acceptable only if BOTH canonical team names match.
   const titleMatch=/^\s*(.{2,90}?)\s+(?:x|×|vs\.?)\s+(.{2,90}?)\s*$/i.exec(String(item.title||""));
   const sourceH=canonical(item?.teams?.home?.name||titleMatch?.[1]);
   const sourceA=canonical(item?.teams?.away?.name||titleMatch?.[2]);
   if(!sourceH||!sourceA||!((sourceH===h&&sourceA===a)||(sourceH===a&&sourceA===h)))continue;
   const when=sourceDayAndMinutes(item);
   if(!when||when.day!==fixture.date)continue;
   const time=/^(\d{1,2}):(\d{2})$/.exec(String(fixture.time||""));
   if(time){
    const minutes=Number(time[1])*60+Number(time[2]);
    if(Math.abs(minutes-when.minutes)>90)continue;
   }
   const group=leagueGroup(item.competition);
   if(wantedGroup&&group&&group!==wantedGroup&&!(
    (wantedGroup==="brasileirao"&&group==="brasileirao-a")||
    (wantedGroup==="brasileirao-a"&&group==="brasileirao")
   ))continue;
   // provider is a *channel label*, never an embed URL. No streaming is used.
   const channels=[...new Set((Array.isArray(item.embeds)?item.embeds:[])
     .map(row=>channelName(row?.provider)).filter(Boolean))].slice(0,3);
   if(channels.length)candidates.push({channels,daysMinutes:when.minutes});
  }
  // Two contradictory records for the same fixture are not reliable.
  if(candidates.length===1)result.set(fixture.id,candidates[0].channels);
  else if(candidates.length>1){
   const keys=[...new Set(candidates.map(x=>x.channels.join("|")))];
   if(keys.length===1)result.set(fixture.id,candidates[0].channels);
  }
 }
 return result;
}
export async function readSportsBroadcasts(matches){
 if(!Array.isArray(matches)||!matches.length)return new Map();
 try{
  // Generic feed fetch only. Never send requested fixtures or customer data.
  const r=await fetch(ROOT+"/sports?category=Futebol",{
   redirect:"error",headers:{accept:"application/json"},signal:AbortSignal.timeout(8000),
   cf:{cacheTtl:300,cacheEverything:true}
  });
  if(!r.ok||!(r.headers.get("content-type")||"").includes("json")||
    Number(r.headers.get("content-length")||0)>2_500_000)return new Map();
  const text=await r.text();
  if(text.length>2_500_000)return new Map();
  const json=JSON.parse(text);
  return json?.success===true?matchBroadcastsFromSports(matches,json.data):new Map();
 }catch{return new Map()}
}
