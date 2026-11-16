import { describe, expect, it } from "vitest";
import { isMajorFootballCompetition as main } from "./vitrine-football-competitions";

describe("Vitrine Futebol — só competições importantes",()=>{
  it.each([
    "Brasileirão Série A","Campeonato Brasileiro Série B","Copa do Brasil",
    "CONMEBOL Libertadores","Copa Sul-Americana","UEFA Champions League",
    "UEFA Nations League","Liga das Nações","Premier League","La Liga",
    "Bundesliga","Serie A Italiana","Copa do Mundo","Eliminatórias",
    "Copa América","FIFA Club World Cup",
  ])("inclui %s",value=>{expect(main(value)).toBe(true)});
  it.each([
    "4ª Divisão Argentina","Copa Paraná","Campeonato Paulista Sub-20",
    "Campeonato Paulista Série A3","Campeonato Brasileiro Série C",
    "Liga Reserva","Liga de Bairro","Copa Amadora",
    "Champions League Sub-20","Futebol"
  ])("exclui %s",value=>{expect(main(value)).toBe(false)});
});