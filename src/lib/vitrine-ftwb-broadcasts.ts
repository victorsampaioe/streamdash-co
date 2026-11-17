/**
 * Broadcast channels from the FTWB API record, without enrichment, search or
 * guessed TV platforms. Only values present in the payload are returned.
 */
const pick=(record:unknown,keys:string[]):unknown=>{
 if(!record||typeof record!=="object")return undefined;
 const obj=record as Record<string,unknown>;
 return keys.map(key=>obj[key]).find(value=>value!==undefined&&value!==null&&value!=="");
};
export function extractFtwbBroadcasts(record:unknown):string[]{
 const raw=pick(record,["canais","transmissoes","transmissao","onde_assistir",
  "broadcast","tv","tvNetworks","ondeAssistir","broadcasts","streaming","transmission",
  "channels","emissoras","plataformas"]);
 const found:string[]=[];
 const visit=(value:unknown,depth=0):void=>{
  if(value===null||value===undefined||depth>4)return;
  if(Array.isArray(value)){for(const part of value)visit(part,depth+1);return;}
  if(typeof value==="string"){
   for(const piece of value.split(/[,;|]/)){
    const name=piece.trim();
    if(!name||/^(sem transmiss[aã]o|transmiss[aã]o n[aã]o confirmada|a confirmar|n[aã]o informado|tbd|n\/a|null)$/i.test(name))continue;
    if(!found.includes(name))found.push(name);
   }
   return;
  }
  if(typeof value==="object"){
   const named=pick(value,["nome","name","canal","channel","emissora","plataforma","titulo","title","label"]);
   if(named!==undefined)visit(named,depth+1);
   else for(const key of ["canais","channels","transmissoes","transmissao","emissoras","plataformas","tv","streaming"]){
    const nested=pick(value,[key]);if(nested!==undefined)visit(nested,depth+1);
   }
  }
 };
 visit(raw);
 return found.slice(0,3);
}
