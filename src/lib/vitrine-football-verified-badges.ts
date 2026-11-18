import type { FootballMatch } from "./vitrine-football.functions";
import { nationalTeamFlagFallback } from "./vitrine-football-ptbr";
import { offlineFootballFlag } from "./vitrine-football-offline-flags";

/** No invented shields: local country flags or already-proxied genuine club logos.
 * If either side is unavailable, omit the ENTIRE fixture before pagination.
 */
export function verifiedTeamBadge(team:string,league:string,sourceUrl:string,
  proxied:Record<string,string>):string{
  const flag=nationalTeamFlagFallback(team,league);
  const code=flag.match(/\/([\w-]+)\.png$/)?.[1]||"";
  const local=offlineFootballFlag(code);
  if(local)return local;
  // FTWB can embed the actual crest bytes directly in the day's fixture.
  // Trust that inline image as-is; do not send it through a URL proxy.
  if(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(sourceUrl))return sourceUrl;
  const source=proxied[sourceUrl]||proxied[flag]||"";
  // Do not draw third-party URLs with broken CORS or fallback initials.
  return /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);/i.test(source)?source:"";
}
export type FootballVisibleSelection={
  visible:FootballMatch[];hidden:FootballMatch[];
};
export function onlyMatchesWithRealBadges(
  matches:FootballMatch[],proxied:Record<string,string>
):FootballVisibleSelection{
  const visible:FootballMatch[]=[],hidden:FootballMatch[]=[];
  for(const match of matches){
    const home=verifiedTeamBadge(match.home,match.league,match.homeBadge||"",proxied);
    const away=verifiedTeamBadge(match.away,match.league,match.awayBadge||"",proxied);
    if(!home||!away){hidden.push(match);continue;}
    visible.push({...match,homeBadge:home,awayBadge:away});
  }
  return {visible,hidden};
}

/** Keep verified FTWB fixtures visible even if the upstream crest image is
 * missing, blocked by its CDN or cannot be proxied. We never substitute an
 * invented club crest: an empty URL allows the canvas to draw an explicitly
 * neutral initials badge. National flags can still be bundled offline.
 */
export function resolveMatchesWithAvailableBadges(
  matches:FootballMatch[],proxied:Record<string,string>
):{visible:FootballMatch[];missingImages:number;matchesWithMissingImages:number}{
  let missingImages=0,matchesWithMissingImages=0;
  const visible=matches.map(match=>{
    const home=verifiedTeamBadge(match.home,match.league,match.homeBadge||"",proxied);
    const away=verifiedTeamBadge(match.away,match.league,match.awayBadge||"",proxied);
    missingImages+=Number(!home)+Number(!away);
    if(!home||!away)matchesWithMissingImages++;
    return {...match,homeBadge:home,awayBadge:away};
  });
  return {visible,missingImages,matchesWithMissingImages};
}
