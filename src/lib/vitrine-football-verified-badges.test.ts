import { describe,expect,it } from "vitest";
import type { FootballMatch } from "./vitrine-football.functions";
import { onlyMatchesWithRealBadges,resolveMatchesWithAvailableBadges,verifiedTeamBadge } from "./vitrine-football-verified-badges";

const item=(id:string,home:string,away:string,league="Brasileirão Série A")=>({
 id,home,away,league,day:"2026-11-17",time:"18:00",
 homeBadge:"https://assets.example/"+id+"-home.png",
 awayBadge:"https://assets.example/"+id+"-away.png",
 broadcasts:["SporTV"]
}) as FootballMatch;
const inlined="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
describe("Modelos 1 e 2: apenas imagens reais e verificadas",()=>{
 it("mantém seleções cuja bandeira nacional real está disponível localmente",()=>{
  const national=item("n","Singapore","Brazil","Amistoso Internacional");
  national.homeBadge="";national.awayBadge="";
  const r=onlyMatchesWithRealBadges([national],{});
  expect(r.visible).toHaveLength(1);
  expect(r.hidden).toHaveLength(0);
  expect(r.visible[0].homeBadge).toMatch(/^data:image\/svg\+xml/);
  expect(r.visible[0].awayBadge).toMatch(/^data:image\/svg\+xml/);
 });
 it("remove completamente confrontos com ao menos um escudo ausente",()=>{
  const valid=item("valid","Santos","São Paulo");
  const missingHome=item("missingHome","Flamengo","Botafogo");
  const missingAway=item("missingAway","Fortaleza","Ceará");
  const noAssets=item("noAssets","Time A","Time B");
  const source:Record<string,string>={
   [valid.homeBadge]:inlined,[valid.awayBadge]:inlined,
   [missingHome.awayBadge]:inlined,[missingAway.homeBadge]:inlined,
  };
  const r=onlyMatchesWithRealBadges([missingHome,valid,missingAway,noAssets],source);
  expect(r.visible.map(m=>m.id)).toEqual(["valid"]);
  expect(r.hidden.map(m=>m.id)).toEqual(["missingHome","missingAway","noAssets"]);
  expect(r.visible[0].homeBadge).toBe(inlined);
 });
 it("não aceita URL externa, string vazia ou falso SVG como prova de emblema",()=>{
  expect(verifiedTeamBadge("Flamengo","Brasileirão","https://broken.example/a.png",{})).toBe("");
  expect(verifiedTeamBadge("Flamengo","Brasileirão","https://x.png",
    {"https://x.png":"https://another-url/logo.png"})).toBe("");
  expect(verifiedTeamBadge("Flamengo","Brasileirão","https://x.png",
    {"https://x.png":"<svg>fake</svg>"})).toBe("");
  expect(verifiedTeamBadge("Flamengo","Brasileirão","https://x.png",
    {"https://x.png":inlined})).toBe(inlined);
 });
 it("preserva a ordem dos jogos elegíveis para redistribuição nas duas grades",()=>{
  const all=Array.from({length:11},(_,i)=>item("id"+i,"Clube "+i,"Rival "+i));
  const sources:Record<string,string>={};
  for(const [i,match] of all.entries())if(i%3!==0){
    sources[match.homeBadge]=inlined;sources[match.awayBadge]=inlined;
  }
  const result=onlyMatchesWithRealBadges(all,sources);
  expect(result.visible.map(m=>m.id)).toEqual(["id1","id2","id4","id5","id7","id8","id10"]);
  expect(result.hidden).toHaveLength(4);
  expect(Math.ceil(result.visible.length/4)).toBe(2);
  expect(Math.ceil(result.visible.length/12)).toBe(1);
 });
 it("preserva todos os jogos retornados pela FTWB, com escudos oficiais quando disponíveis",()=>{
  const a=item("a","Flamengo","Palmeiras");
  const b=item("b","Corinthians","Grêmio");
  const c=item("c","Santos","Bahia");
  const actual={
    [a.homeBadge]:inlined,[a.awayBadge]:inlined,
    [c.homeBadge]:inlined,
  };
  const result=resolveMatchesWithAvailableBadges([a,b,c],actual);
  expect(result.visible.map(x=>x.id)).toEqual(["a","b","c"]);
  expect(result.visible[0].homeBadge).toBe(inlined);
  expect(result.visible[0].awayBadge).toBe(inlined);
  expect(result.visible[1].homeBadge).toBe("");
  expect(result.visible[1].awayBadge).toBe("");
  expect(result.visible[2].homeBadge).toBe(inlined);
  expect(result.matchesWithMissingImages).toBe(2);
  expect(result.missingImages).toBe(3);
 });
 it("aceita as imagens inline enviadas pela própria FTWB sem proxy extra",()=>{
  const live=item("inline","São Paulo","Fortaleza");
  live.homeBadge=inlined;live.awayBadge=inlined;
  const result=resolveMatchesWithAvailableBadges([live],{});
  expect(result.visible[0].homeBadge).toBe(inlined);
  expect(result.visible[0].awayBadge).toBe(inlined);
  expect(result.missingImages).toBe(0);
 });

});