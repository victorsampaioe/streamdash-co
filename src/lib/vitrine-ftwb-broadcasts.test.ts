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
  it("deduplica e limita a até três canais",()=>{
    expect(extractFtwbBroadcasts({tv:"ESPN, ESPN, Disney+, Globo, Premiere"}))
      .toEqual(["ESPN","Disney+","Globo"]);
  });
});