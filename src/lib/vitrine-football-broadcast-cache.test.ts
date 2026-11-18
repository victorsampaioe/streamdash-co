import {describe,it,expect} from "vitest";
import {
 footballBroadcastFixtureKey,cleanVerifiedBroadcasts,chooseVerifiedBroadcasts
} from "./vitrine-football-broadcast-cache";

describe("verified TV broadcast persistence",()=>{
 it("keeps the same cache identity after FTWB reorders the teams",()=>{
  const forward=footballBroadcastFixtureKey({home:"Flamengo",away:"Athletico-PR"});
  const reverse=footballBroadcastFixtureKey({home:"Athletico PR",away:"Flamengo"});
  expect(forward).toBe("athletico pr::flamengo");
  expect(reverse).toBe(forward);
 });
 it("matches the old verified Cloudflare KV fixture names despite accents",()=>{
  expect(footballBroadcastFixtureKey({home:"Grêmio",away:"Bahia"})).toBe("bahia::gremio");
  expect(footballBroadcastFixtureKey({home:"Santos",away:"Coritiba"})).toBe("coritiba::santos");
 });
 it("preserves verified channels when a later API response is empty",()=>{
  expect(chooseVerifiedBroadcasts([],["Record","CazéTV","Premiere"])).toEqual(["Record","CazéTV","Premiere"]);
  expect(chooseVerifiedBroadcasts(["Sem transmissão"],["SporTV","Premiere"])).toEqual(["SporTV","Premiere"]);
 });
 it("uses newer explicit broadcaster info while rejecting guesses or placeholders",()=>{
  expect(chooseVerifiedBroadcasts(["ESPN 4","Disney+"],["ESPN"])).toEqual(["ESPN 4","Disney+"]);
  expect(cleanVerifiedBroadcasts(["A confirmar","Sem transmissão","Premiere","premiere","GOAT"])).toEqual(["Premiere","GOAT"]);
 });
});
