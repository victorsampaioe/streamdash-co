/**
 * A last-resort, date-scoped TV guide lookup. Only explicitly named channels
 * printed beside BOTH matching teams in the guide are accepted. This never
 * invents networks based on rights or competition and never changes fixtures.
 */
export type GuideFixture={id:string;home:string;away:string;day:string};
const tidy=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const aliases:Record<string,string>={
 "at paranaense":"athletico pr","athletico paranaense":"athletico pr",
 "cr flamengo":"flamengo","bahia":"bahia",
 "inter milan":"inter de milao","inter milao":"inter de milao",
 "man city":"manchester city","bk hacken":"hacken",
 "oh leuven":"oud heverlee leuven","oh leuven women":"oud heverlee leuven",
 "paris saint germain":"psg","paris sg":"psg",
};
export function canonicalGuideClub(name:string):string{
 let value=tidy(name)
  .replace(/\b(?:feminino|feminina|women|womens|ladies|female)\b/g,"")
  .replace(/\s+f$/,"").replace(/\s+/g," ").trim();
 value=aliases[value]||value;
 return value;
}
const channels:[string,RegExp][]=[
 ["ESPN Brasil (YouTube)",/\bespn\s+brasil\s*(?:\(youtube\)|no youtube|youtube)/i],
 ["ESPN 4",/\bespn\s*4\b/i],["ESPN 3",/\bespn\s*3\b/i],
 ["ESPN 2",/\bespn\s*2\b/i],["ESPN",/\bespn\b(?!\s*(?:[234]|brasil))/i],
 ["Premiere",/\bpremiere\b/i],
 ["SporTV 3",/\bsportv\s*3\b/i],["SporTV 2",/\bsportv\s*2\b/i],
 ["SporTV",/\bsportv\b(?!\s*[23])/i],
 ["Record",/\b(?:recordtv|record\s*tv|record)\b/i],
 ["CazéTV",/\b(?:caze\s*tv|cazetv)\b/i],
 ["Globo",/\b(?:tv globo|globo\s*tv|rede globo|globo)\b/i],
 ["ge tv",/\b(?:ge\s*tv|ge\s*televisao)\b/i],
 ["Disney+",/\bdisney\s*\+/i],
 ["Prime Video",/\b(?:prime video|amazon prime)\b/i],
 ["TNT Sports",/\btnt\s*sports?\b/i],["Max",/\b(?:hbo max|max streaming)\b/i],
 ["SBT",/\bsbt\b/i],["BandSports",/\bbandsports?\b/i],
 ["DAZN",/\bdazn\b/i],["Apple TV",/\bapple\s*tv\b/i],
 ["Paramount+",/\bparamount\s*\+/i],["FIFA+",/\bfifa\s*\+/i],
];
function decodeEntities(input:string){
 return input.replace(/&(?:amp|nbsp|quot|apos|lt|gt);/g,m=>({
 "&amp;":"&","&nbsp;":" ","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">"
 } as Record<string,string>)[m]||m).replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}
export function guideTextLines(html:string):string[]{
 const safe=html.slice(0,1_300_000)
   .replace(/<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|svg)\s*>/gi," ")
   .replace(/<!--([\s\S]*?)-->/g," ")
   .replace(/<\/?(?:br|tr|td|div|p|section|li|h[1-6]|article|time|span|a|strong|small)\b[^>]*>/gi,"\n")
   .replace(/<[^>]+>/g," ");
 return decodeEntities(safe).split(/\n+/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
}
export function findGuideChannels(
 html:string,date:string,matches:GuideFixture[],
):Record<string,string[]>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {};
 const page=guideTextLines(html);
 const displayed=new Intl.DateTimeFormat("pt-BR",{
   timeZone:"UTC",day:"numeric",month:"long",year:"numeric",
 }).format(new Date(date+"T12:00:00Z"));
 const joined=tidy(page.slice(0,180).join(" "));
 // A page covering another day must not authorize today's TV claims.
 if(!joined.includes(tidy(displayed))&&!joined.includes(date))return {};
 const start=page.findIndex(x=>/Agenda do dia|Jogos de .{0,25}\d{1,2} de/i.test(x));
 const end=page.findIndex((x,i)=>i>0&&/Pr[oó]xima programa[cç][aã]o|Jogos de (?:amanh[aã]|quinta|sexta|sábado|domingo)/i.test(x));
 const relevant=page.slice(Math.max(0,start),end>start?end:Math.min(page.length,500));
 const normalized=relevant.map(x=>canonicalGuideClub(x));
 const output:Record<string,string[]>={};
 for(const match of matches){
   if(match.day!==date)continue;
   const home=canonicalGuideClub(match.home),away=canonicalGuideClub(match.away);
   if(!home||!away||home===away)continue;
   for(let i=0;i<relevant.length;i++){
     if(!normalized[i].includes(home))continue;
     const other=normalized.slice(i,i+5).findIndex(x=>x.includes(away));
     if(other<0)continue;
     const at=i+other;
     const broadcast:string[]=[];
     for(let j=at;j<Math.min(relevant.length,at+9);j++){
       if(j>at&&(/^\d{1,2}[:h]\d{2}$/.test(relevant[j])||/\bver mais\b/i.test(relevant[j])))break;
       const channelLine=relevant[j].normalize("NFD").replace(/[\u0300-\u036f]/g,"");
       for(const [name,regex] of channels){
         if(regex.test(channelLine)&&!broadcast.includes(name))broadcast.push(name);
       }
     }
     if(broadcast.length){output[match.id]=broadcast.slice(0,3);break;}
   }
 }
 return output;
}
