/** Confirmed, date-specific broadcast data kept as a safe fallback.
 * General verified broadcasts are stored durably in Cloudflare KV; these few
 * records protect known matches if the Worker or a news feed is unavailable.
 */
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const equivalent=(value:string,options:string[])=>options.includes(normalized(value));
export function verifiedFootballBroadcasts(home:string,away:string,date:string):string[]{
  const pair=(left:string[],right:string[])=>{
    return (equivalent(home,left)&&equivalent(away,right))||
      (equivalent(away,left)&&equivalent(home,right));
  };
  if(date==="2026-11-16"){
    // ESPN and Disney+ were both listed for this UEFA Nations League fixture.
    // Sources: VEJA (16 Nov 2026), 365Scores (16 Nov 2026), SBT News (16 Nov 2026).
    if(pair(["alemanha","germany","deutschland"],
      ["holanda","paises baixos","netherlands","the netherlands"]))
      return ["ESPN","Disney+"];
    // Copa Paraná final: FPF TV, Rede Furacão and TMC Esporte.
    if(pair(["athletico pr","athletico paranaense","atletico pr","atletico paranaense"],
      ["parana","parana clube"]))return ["FPF TV","Rede Furacão","TMC Esporte"];
  }
  return [];
}
