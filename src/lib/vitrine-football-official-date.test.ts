import {describe,it,expect} from "vitest";
import {officialFixtureDate} from "./vitrine-football-official-date";

describe("Agenda oficial UEFA — controle de data de Fortaleza",()=>{
  it("Suíça x Escócia aconteceu em 16/11 e não em 17/11",()=>{
    const game=officialFixtureDate("Suíça","Escócia");
    expect(game?.day).toBe("2026-11-16");
    expect(game?.time).toBe("16:45");
    expect(game?.iso).toBe("2026-11-16T19:45:00.000Z");
  });
  it("reconhece nomes internacionais dos dois clubes",()=>{
    expect(officialFixtureDate("Scotland","Switzerland")?.day).toBe("2026-11-16");
    expect(officialFixtureDate("Germany","Netherlands")?.time).toBe("16:45");
  });
  it("não inventa datas para confrontos não verificados",()=>{
    expect(officialFixtureDate("Dinamarca","Noruega")).toBeNull();
  });
});