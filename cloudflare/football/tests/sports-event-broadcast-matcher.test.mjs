import test from "node:test";
import assert from "node:assert/strict";
import { matchBroadcastsFromSports } from "../sports-event-broadcast-matcher.mjs";

const fixture={id:"ftwb-match",home:"Palmeiras",away:"Flamengo",date:"2026-11-21",time:"16:30",league:"Brasileirão Série A"};
function event(title="Palmeiras x Flamengo",time="16:30",providers=["Premiere Clubes","Premiere Clubes (Alternativo)","GE TV"],overrides={}){
 const date="2026-11-21";
 return {title,competition:"Brasileirão",start_time:date+" "+time+":00",
   start_timestamp:Math.floor(Date.parse(date+"T"+time+":00-03:00")/1000),
   embeds:providers.map(provider=>({provider,embed_url:"https://example.invalid/not-used"})),...overrides};
}
test("matches live API structure without teams and deduplicates broadcasters",()=>{
 assert.deepEqual(matchBroadcastsFromSports([fixture],[event()]).get(fixture.id),["Premiere","ge tv"]);
});
test("accepts numbered Premiere feed labels",()=>{
 const f={...fixture,id:"second",home:"Bahia",away:"Coritiba",time:"17:30"};
 assert.deepEqual(matchBroadcastsFromSports([f],[event("Bahia x Coritiba","17:30",["Premiere 2"])]).get("second"),["Premiere 2"]);
});
test("rejects wrong team pairing",()=>assert.equal(matchBroadcastsFromSports([fixture],[event("Vasco x Flamengo")]).size,0));
test("rejects inconsistent kickoff",()=>assert.equal(matchBroadcastsFromSports([fixture],[event(undefined,"20:00")]).size,0));
test("rejects internally inconsistent Unix timestamps",()=>assert.equal(matchBroadcastsFromSports([fixture],[event(undefined,undefined,undefined,{start_timestamp:1752189600})]).size,0));
test("rejects U20 games",()=>assert.equal(matchBroadcastsFromSports([fixture],[event(undefined,undefined,undefined,{competition:"Brasileirão Sub-20"})]).size,0));
test("does not treat generic source names as broadcast channels",()=>assert.equal(matchBroadcastsFromSports([fixture],[event(undefined,undefined,["Servidor 1"])]).size,0));
test("rejects conflicting duplicate broadcaster lists",()=>assert.equal(matchBroadcastsFromSports([fixture],[event(),event(undefined,undefined,["ESPN"])]).size,0));
