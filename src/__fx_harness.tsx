import { createRoot } from "react-dom/client";
import { FootballSchedulePoster } from "@/components/vitrine/football-schedule-poster";
import { createFootballArtworkFile } from "@/lib/vitrine-football-dom-export";
const crest="https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Flamengo_braz_logo.svg/120px-Flamengo_braz_logo.svg.png";
const blocked="https://example.invalid/x.png";
const m=(i:number)=>({id:"m"+i,home:"Time Casa "+i,away:"Visitante "+i,homeId:"a",awayId:"b",homeBadge:i===2?blocked:crest,awayBadge:crest,league:"Brasileirão",time:"16:00",iso:"",day:"2026-11-17",broadcasts:["Globo","Premiere"]});
export async function run(mode:"stage"|"inview"){
  const host=document.createElement("div");
  host.style.cssText=mode==="stage"?"position:fixed;left:-1800px;top:0;width:1080px;z-index:-100":"position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;z-index:-1";
  document.body.appendChild(host);
  const inner=document.createElement("div");inner.style.cssText="width:1080px;height:1080px;overflow:hidden";host.appendChild(inner);
  createRoot(inner).render(<FootballSchedulePoster kind="today" format="feed" matches={[0,1,2,3].map(m) as any} day="2026-11-17" headline="EVENTOS DE HOJE" brand="Revenda X" logo="/favicon.ico" contact="85999998888" badgeImages={{}} broadcastByMatch={{m0:"Globo",m1:"SporTV",m2:"Premiere",m3:"ESPN"}} playerPhoto="" playerName="" stadium="" accent="#146df2"/>);
  await new Promise(r=>setTimeout(r,2500));
  try{const f=await createFootballArtworkFile(inner,"x.png");
    const u=URL.createObjectURL(f);(window as any).__url=u;return "OK "+f.size;}
  catch(e:any){return "ERR "+Object.prototype.toString.call(e)+" "+(e?.message||e?.type||String(e));}
}
