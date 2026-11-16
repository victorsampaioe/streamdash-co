import {describe,it,expect} from "vitest";
import {verifiedFootballBroadcasts} from "./vitrine-football-verified-broadcasts";

describe("Transmissões confirmadas por confronto e data",()=>{
  it("mantém ESPN e Disney+ para Alemanha x Holanda em 16/11/2026",()=>{
    expect(verifiedFootballBroadcasts("Alemanha","Holanda","2026-11-16"))
      .toEqual(["ESPN","Disney+"]);
    expect(verifiedFootballBroadcasts("Países Baixos","Germany","2026-11-16"))
      .toEqual(["ESPN","Disney+"]);
    expect(verifiedFootballBroadcasts("Holanda","Alemanha","2026-11-16"))
      .toEqual(["ESPN","Disney+"]);
  });
  it("conserva transmissão Suíça x Escócia no dia 16/11/2026",()=>{
    expect(verifiedFootballBroadcasts("Suíça","Escócia","2026-11-16"))
      .toEqual(["ESPN 4","Disney+"]);
    expect(verifiedFootballBroadcasts("Switzerland","Scotland","2026-11-16"))
      .toEqual(["ESPN 4","Disney+"]);
    expect(verifiedFootballBroadcasts("Suíça","Escócia","2026-11-17")).toEqual([]);
  });
  it("não atribui os canais de um jogo a outra partida ou data",()=>{
    expect(verifiedFootballBroadcasts("Alemanha","Holanda","2026-11-17")).toEqual([]);
    expect(verifiedFootballBroadcasts("Alemanha","Grécia","2026-11-16")).toEqual([]);
  });
  it("preserva os canais verificados do Athletico-PR x Paraná",()=>{
    expect(verifiedFootballBroadcasts("Athletico-PR","Paraná Clube","2026-11-16"))
      .toEqual(["FPF TV","Rede Furacão","TMC Esporte"]);
  });
});