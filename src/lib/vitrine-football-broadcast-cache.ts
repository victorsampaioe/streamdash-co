/**
 * Stable identity for a game across separately filtered FTWB API responses.
 * Do not key broadcaster cache by FTWB's generated match ID or array position.
 */
const normalize=(value:string)=>String(value||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export function footballBroadcastFixtureKey(match:{home:string;away:string}):string {
  const teams=[normalize(match.home),normalize(match.away)].sort();
  return teams.join("::").slice(0,240);
}

/** Only store broadcaster strings explicitly supplied/verified by providers. */
export function cleanVerifiedBroadcasts(value:unknown):string[]{
  if(!Array.isArray(value))return [];
  const seen=new Set<string>(),names:string[]=[];
  const placeholders=/^(?:sem transmiss(?:a|ã)o|transmiss(?:a|ã)o n(?:a|ã)o (?:confirmada|informada)|a confirmar|canal a confirmar|aguardando confirma(?:ç|c)(?:ã|a)o|n(?:a|ã)o informado|tbd|n\/a|indispon[ií]vel)$/i;
  for(const entry of value){
    if(typeof entry!=="string")continue;
    const name=entry.replace(/\s+/g," ").trim();
    if(!name||name.length>75||placeholders.test(name))continue;
    const identity=normalize(name);
    if(!identity||seen.has(identity))continue;
    seen.add(identity);names.push(name);
    if(names.length===3)break;
  }
  return names;
}

export function chooseVerifiedBroadcasts(
  current:unknown,persisted:unknown,
):string[]{
  const currentChannels=cleanVerifiedBroadcasts(current);
  return currentChannels.length?currentChannels:cleanVerifiedBroadcasts(persisted);
}
