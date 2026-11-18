/**
 * Read official "where to watch" fields from FTWB fixture responses.
 * Broadcasting metadata may be top-level, nested under jogo/detalhes,
 * or returned as a provider array. Do not guess a TV channel from a league.
 */
type Row=Record<string,unknown>;
const asRow=(v:unknown):Row|null=>v&&typeof v==="object"&&!Array.isArray(v)?v as Row:null;
const simplify=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g,"");
function fieldValues(value:unknown,fields:string[]):unknown[]{
  const record=asRow(value);if(!record)return [];
  const keys=new Set(fields.map(simplify));
  return Object.entries(record).filter(([k])=>keys.has(simplify(k)))
    .map(([,v])=>v).filter(v=>v!==null&&v!==undefined&&v!=="");
}
const outer=[
  "canais","canal","canais_tv","canais_transmissao","canaisTransmissao","tv_canais",
  "transmissoes","transmissão","transmissao","transmissao_tv","transmissoes_tv",
  "onde_assistir","ondeAssistir","onde_passar","onde_passa","ondeVer",
  "broadcast","broadcasts","broadcasters","broadcaster","streaming",
  "transmission","channels","channel","emissoras","emissora",
  "plataformas","plataforma","televisao","televisão","tv","watch_on",
  "watch","where_to_watch","whereToWatch",
];
const names=[
 "nome","name","canal","channel","emissora","plataforma","titulo","title",
 "label","descricao","description","network","service","provider",
];
const wrappers=[
 "jogo","partida","match","fixture","dados","data","detalhes","details",
 "informacoes","info","transmissionInfo","broadcast_info",
];
const placeholders=/^(?:sem transmiss(?:a|ã)o|transmiss(?:a|ã)o n(?:a|ã)o (?:confirmada|informada)|a confirmar|n(?:a|ã)o informado|tbd|n\/a|null|sim|n(?:a|ã)o|ao vivo|live|tv|streaming|canal|indispon[ií]vel)$/i;

export function extractFtwbBroadcasts(record:unknown):string[]{
 const found:string[]=[];
 const visited=new Set<unknown>();
 const accept=(value:string)=>{
   for(const part of value.split(/[,;|]/)){
     const name=part.replace(/\s+/g," ").trim();
     if(!name||name.length>75||placeholders.test(name))continue;
     if(!found.some(old=>simplify(old)===simplify(name)))found.push(name);
   }
 };
 const visit=(value:unknown,depth=0):void=>{
   if(value===null||value===undefined||depth>6||found.length>=3)return;
   if(typeof value==="string"){accept(value);return;}
   if(typeof value!=="object"||visited.has(value))return;
   visited.add(value);
   if(Array.isArray(value)){
     for(const item of value.slice(0,30))visit(item,depth+1);
     return;
   }
   const row=asRow(value)!;
   // Mixed structures can include both a primary channel and an array of
   // additional networks. Read all explicitly labeled broadcaster fields.
   for(const item of [...fieldValues(row,names),...fieldValues(row,outer)])
     visit(item,depth+1);
 };
 const scan=(value:unknown,depth=0):void=>{
   if(depth>3||!asRow(value))return;
   for(const v of fieldValues(value,outer))visit(v);
   for(const nested of fieldValues(value,wrappers))scan(nested,depth+1);
 };
 scan(record);
 return found.slice(0,3);
}
