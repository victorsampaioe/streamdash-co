import {describe,it,expect} from "vitest";
import {getResellerEncodingSettings} from "./vitrine-video-quality";

describe("Vitrine Vídeos: MP4 fluido e compatível",()=>{
  it("reduz 1080x1920 para 720x1280 24 fps em aparelhos atuais",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{hardwareConcurrency:8,deviceMemory:8}))
      .toMatchObject({width:720,height:1280,fps:24,bitrate:1_800_000,mode:"balanced"});
  });
  it("adapta para 480x854 24 fps em celulares menos potentes",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{hardwareConcurrency:4}))
      .toMatchObject({width:480,height:854,fps:24,mode:"compatible"});
  });
  it("oferece modo manual de compatibilidade quando hardware é desconhecido",()=>{
    expect(getResellerEncodingSettings(1080,1920,"compatible",{}))
      .toMatchObject({width:480,height:854,fps:24,bitrate:950_000});
  });
  it("mantém opção original sem ampliar a resolução",()=>{
    expect(getResellerEncodingSettings(1080,1920,"high",{}))
      .toMatchObject({width:1080,height:1920,fps:30,bitrate:3_000_000});
    expect(getResellerEncodingSettings(540,960,"high",{}))
      .toMatchObject({width:540,height:960,fps:30});
  });
  it("não aumenta a resolução de fontes menores e usa dimensões pares",()=>{
    const q=getResellerEncodingSettings(853,479,"auto",{hardwareConcurrency:8});
    expect(q.width%2).toBe(0);
    expect(q.height%2).toBe(0);
    expect(q.width).toBeLessThanOrEqual(853);
    expect(q.height).toBeLessThanOrEqual(479);
  });
  it("recusa dimensões inválidas em vez de gerar vídeo quebrado",()=>{
    expect(()=>getResellerEncodingSettings(0,1920)).toThrow(/inválidas/);
    expect(()=>getResellerEncodingSettings(Number.NaN,1920)).toThrow(/inválidas/);
  });
});
