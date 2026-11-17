import { describe, expect, it } from "vitest";
import { isMajorFootballCompetition as main, isFeaturedFootballFixture as featured, isYouthFootballFixture } from "./vitrine-football-competitions";

describe("Vitrine Futebol — só competições importantes",()=>{
  it.each([
    "Brasileirão Série A","Campeonato Brasileiro Série B","Copa do Brasil",
    "CONMEBOL Libertadores","Copa Sul-Americana","UEFA Champions League",
    "UEFA Nations League","Liga das Nações","Premier League","La Liga",
    "Bundesliga","Serie A Italiana","Copa do Mundo","Eliminatórias",
    "Copa América","FIFA Club World Cup",
    "Campeonato Paulista Feminino","Brasileirão Feminino",
  ])("inclui %s",value=>{expect(main(value)).toBe(true)});
  it.each([
    "4ª Divisão Argentina","Copa Paraná","Campeonato Paulista Sub-20",
    "Campeonato Paulista Série A3","Campeonato Brasileiro Série C",
    "Liga Reserva","Liga de Bairro","Copa Amadora",
    "Champions League Sub-20","Futebol","CONCACAF Nations League",
    "Liga das Nações CONCACAF","UEFA Nations League Sub 20",
    "Amistoso Internacional Sub-20","Campeonato Paulista Feminino Sub-20",
    "Amistoso Internacional", "International Friendlies",
  ])("exclui %s",value=>{expect(main(value)).toBe(false)});
  it("inclui somente o Brasil em amistosos internacionais profissionais",()=>{
    expect(main("Amistoso Internacional")).toBe(false);
    expect(featured("Amistoso Internacional","Singapura","Brasil")).toBe(true);
    expect(featured("International Friendlies","Brazil","Argentina")).toBe(true);
    expect(featured("Amistosos de Seleções","Portugal","Espanha")).toBe(false);
    expect(featured("International Friendly Games","Argentina","Japão")).toBe(false);
    expect(featured("Amistoso Internacional Sub-20","Brasil","Argentina")).toBe(false);
    expect(featured("Amistoso Internacional","Brasil Sub-20","Uruguai")).toBe(false);
    expect(featured("Brasileirão Série A","Flamengo","Palmeiras")).toBe(true);
    expect(featured("UEFA Nations League","Portugal","Espanha")).toBe(true);
  });
  it("rejeita Sub-20 mesmo quando o campeonato é principal",()=>{
    expect(isYouthFootballFixture("UEFA Nations League","Brasil Sub-20","Itália Sub-20")).toBe(true);
    expect(isYouthFootballFixture("UEFA Nations League","Brasil","Itália")).toBe(false);
  });
});