import {describe,expect,it} from "vitest";
import {findGuideChannels} from "./vitrine-football-broadcast-guide";

const date="2026-11-18";
const home={id:"br1",home:"Coritiba",away:"Santos",day:date};
const league={id:"eu1",home:"Real Madrid (F)",away:"Inter de Milão (F)",day:date};
const all=[home,league,{id:"br2",home:"Remo",away:"Chapecoense",day:date}];
const html=(content:string,heading="quarta-feira, 18 de novembro de 2026")=>
 `<!doctype html><html lang="pt-BR"><head><title>Guia</title></head><body>
 <h2>Agenda do dia</h2><h2>${heading}</h2>${content}
 <h2>Próxima programação</h2><p>Flamengo x Palmeiras — ESPN 4</p>
 </body></html>`;

describe("Onde assistir: canais só de jogos reais na data solicitada",()=>{
 it("recupera todos os canais da Série A presentes na grade do dia",()=>{
   const listing=html(`
     <div><time>19:30</time><span>Coritiba</span><span>Santos</span>
       <div>Premiere</div><div>CazéTV YouTube</div><span>RecordTV</span><span>Ver mais</span></div>
     <div><time>20:00</time><span>Remo</span><span>Chapecoense</span>
       <div>Premiere</div><span>Ver mais</span></div>`);
   expect(findGuideChannels(listing,date,all)).toEqual({
     br1:["Premiere","CazéTV","Record"],br2:["Premiere"],
   });
 });
 it("reconhece equipes da Champions Feminina e ESPN/Disney+",()=>{
   const listing=html(`
     <div><time>14:45</time><span>Real Madrid Feminino</span>
       <span>Inter Milan Feminino</span><span>Disney+ Premium</span><span>ESPN 4</span>
       <span>Ver mais</span></div>`);
   expect(findGuideChannels(listing,date,all).eu1).toEqual(["Disney+","ESPN 4"]);
 });
 it("não inventa transmissões por liga ou pelo canal do jogo seguinte",()=>{
   const listing=html(`
     <div><time>19:30</time><span>Coritiba</span><span>Santos</span>
       <span>Transmissão ainda sem confirmação</span><span>Ver mais</span></div>
     <div><time>20:00</time><span>Remo</span><span>Chapecoense</span>
       <span>Premiere</span><span>Ver mais</span></div>`);
   expect(findGuideChannels(listing,date,[home,all[2]])).toEqual({br2:["Premiere"]});
 });
 it("nunca aplica transmissões de uma data diferente",()=>{
   const listing=html(`
     <div><time>19:30</time><span>Coritiba</span><span>Santos</span><div>Premiere</div></div>`,
     "quinta-feira, 19 de novembro de 2026");
   expect(findGuideChannels(listing,date,[home])).toEqual({});
 });
 it("não transfere canais do calendário seguinte para o dia analisado",()=>{
   expect(findGuideChannels(html("<p>Sem jogos confirmados</p>"),date,[home])).toEqual({});
 });
});
