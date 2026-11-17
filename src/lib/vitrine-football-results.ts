/**
 * Canonical final-score detection for the FTWB fixture feed.
 * Never infer that a game has finished from its scheduled kickoff or score alone.
 */
const simplify=(value:unknown)=>String(value??"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

export function isFinishedFootballStatus(value:unknown):boolean{
  const status=simplify(value).replace(/[_-]+/g," ").replace(/\s+/g," ");
  return /^(?:encerrad[oa]|finalizad[oa]|concluid[oa]|final|finished|ended|ft|full ?time|after extra time|aet|apos prorrogacao|after penalties|penalties)(?:\b|$)/.test(status);
}
function goals(raw:unknown):number|null{
  if(typeof raw!=="number" && typeof raw!=="string")return null;
  const value=String(raw).trim();
  if(!/^\d{1,2}$/.test(value))return null;
  const score=Number(value);
  return Number.isSafeInteger(score)&&score>=0&&score<=99?score:null;
}
export type FootballFinalScore={home:number;away:number;label:string};
export function parseFootballFinalScore(raw:unknown):FootballFinalScore|null{
  if(typeof raw!=="string")return null;
  const match=/^\s*(\d{1,2})\s*(?:x|×|:|–|-)\s*(\d{1,2})\s*$/i.exec(raw);
  if(!match)return null;
  const home=goals(match[1]),away=goals(match[2]);
  return home!==null&&away!==null?{home,away,label:home+" × "+away}:null;
}
export function matchFinalScore(homeRaw:unknown,awayRaw:unknown,combined:unknown):FootballFinalScore|null{
  const home=goals(homeRaw),away=goals(awayRaw);
  if(home!==null&&away!==null)return {home,away,label:home+" × "+away};
  if(typeof combined==="string")return parseFootballFinalScore(combined);
  return null;
}
export function isVerifiedFinishedFootballMatch(match:{status?:string;scoreLabel?:string}):boolean{
  return isFinishedFootballStatus(match.status)&&parseFootballFinalScore(match.scoreLabel)!==null;
}
/** Preserve confirmed full-time data when the feed returns duplicates
 * for status-filtered and unfiltered requests.
 */
export function preferFootballFixture<T extends {
  status?:string;scoreLabel?:string;homeBadge?:string;awayBadge?:string;
  broadcasts?:string[];time?:string;playerPhoto?:string
}>(previous:T,current:T):T{
  const score=(match:T)=>Number(isVerifiedFinishedFootballMatch(match))*100+
    Number(!!match.homeBadge)+Number(!!match.awayBadge)+
    (match.broadcasts?.length||0)*3+Number(/^\d{2}:\d{2}$/.test(match.time||""));
  const first=score(current)>score(previous)?current:previous;
  const alternate=first===current?previous:current;
  return {
    ...first,
    homeBadge:first.homeBadge||alternate.homeBadge||"",
    awayBadge:first.awayBadge||alternate.awayBadge||"",
    broadcasts:first.broadcasts?.length?first.broadcasts:alternate.broadcasts,
    playerPhoto:first.playerPhoto||alternate.playerPhoto,
  };
}
