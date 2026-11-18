import { describe, it, expect } from "vitest";
import { extractFtwbBroadcasts } from "./vitrine-ftwb-broadcasts";

describe("FTWB - fonte única de transmissões",()=>{
  it("usa os canais exatamente como recebidos da FTWB",()=>{
    expect(extractFtwbBroadcasts({canais:["ESPN","Disney+"]}))
      .toEqual(["ESPN","Disney+"]);
    expect(extractFtwbBroadcasts({transmissoes:[{nome:"Globo"},{nome:"Premiere"}]}))
      .toEqual(["Globo","Premiere"]);
    expect(extractFtwbBroadcasts({transmissao:{canais:[{canal:"SporTV"}]}}))
      .toEqual(["SporTV"]);
  });
  it("não inventa canais ao receber payload sem transmissão",()=>{
    expect(extractFtwbBroadcasts({home:"Alemanha",away:"Holanda"})).toEqual([]);
    expect(extractFtwbBroadcasts({canais:"Transmissão não confirmada"})).toEqual([]);
    expect(extractFtwbBroadcasts({canais:null})).toEqual([]);
  });
  it("lê informações em dados de jogo e formas aninhadas da FTWB",()=>{
    expect(extractFtwbBroadcasts({
      dados:{jogo:{transmissao:{canais:[
        {nome:"Premiere"},{plataforma:"Disney+"}
      ]}}}
    })).toEqual(["Premiere","Disney+"]);
  });
  it("não perde a transmissão confirmada quando outro campo tem placeholder",()=>{
    expect(extractFtwbBroadcasts({
      transmissoes:"Transmissão não informada",
      canais_tv:["SporTV","Premiere"],
    })).toEqual(["SporTV","Premiere"]);
  });
  it("recupera também canais indicados na estrutura TV + streamings",()=>{
    expect(extractFtwbBroadcasts({
      onde_assistir:{tv:"Record",streaming:["CazéTV","Premiere"]}
    })).toEqual(["Record","CazéTV","Premiere"]);
  });
  it("deduplica e limita a até três canais",()=>{
    expect(extractFtwbBroadcasts({tv:"ESPN, ESPN, Disney+, Globo, Premiere"}))
      .toEqual(["ESPN","Disney+","Globo"]);
  });
});