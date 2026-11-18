import {describe,it,expect} from "vitest";
import {getResellerEncodingSettings,nextResellerFrameDeadline,resolveResellerEncodingMode} from "./vitrine-video-quality";

describe("Vitrine Vídeos: qualidade automática de MP4 adaptada ao aparelho",()=>{
  it("exporta alta qualidade 1080p/30fps em aparelho potente",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{
      hardwareConcurrency:8,deviceMemory:8,isMobile:true,
    })).toMatchObject({width:1080,height:1920,fps:30,bitrate:5_000_000,mode:"high"});
  });
  it("não confunde o Safari de um iPhone moderno com um aparelho fraco por reportar 4 núcleos",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{
      hardwareConcurrency:4,isAppleMobile:true,isMobile:true,iosMajor:26,devicePixelRatio:3,
    })).toMatchObject({width:1080,height:1920,fps:30,mode:"high"});
  });
  it("prioriza a capacidade real de codificação HD relatada pelo navegador",()=>{
    expect(resolveResellerEncodingMode("auto",{
      hardwareConcurrency:4,isAppleMobile:true,isMobile:true,iosMajor:18,
      devicePixelRatio:2,encoderSmooth:true,encoderPowerEfficient:true,
    })).toBe("high");
  });
  it("reduz para 720p nos iPhones intermediários sem confirmação de encoder HD",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{
      hardwareConcurrency:4,isAppleMobile:true,isMobile:true,iosMajor:26,devicePixelRatio:2,
    })).toMatchObject({width:720,height:1280,fps:24,bitrate:2_400_000,mode:"balanced"});
  });
  it("mantém 480p/24fps nos iPhones antigos",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{
      hardwareConcurrency:4,isAppleMobile:true,isMobile:true,iosMajor:16,devicePixelRatio:2,
    })).toMatchObject({width:480,height:854,fps:24,bitrate:950_000,mode:"compatible"});
  });
  it("mantém 480p/24fps em Android mais fraco",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{
      hardwareConcurrency:4,deviceMemory:2,isMobile:true,isAppleMobile:false,
    })).toMatchObject({width:480,height:854,fps:24,mode:"compatible"});
  });
  it("não exporta 1080p se o navegador indicar codificação não suave",()=>{
    expect(getResellerEncodingSettings(1080,1920,"auto",{
      hardwareConcurrency:8,deviceMemory:8,encoderSmooth:false,isMobile:true,
    })).toMatchObject({width:720,height:1280,mode:"balanced"});
  });
  it("permite selecionar manualmente a opção de compatibilidade em hardware potente",()=>{
    expect(getResellerEncodingSettings(1080,1920,"compatible",{
      hardwareConcurrency:12,deviceMemory:16,
    })).toMatchObject({width:480,height:854,fps:24,bitrate:950_000});
  });
  it("permite solicitar qualidade máxima manualmente e não amplia o vídeo original",()=>{
    expect(getResellerEncodingSettings(1080,1920,"high",{
      hardwareConcurrency:2,deviceMemory:2,isMobile:true,
    })).toMatchObject({width:1080,height:1920,fps:30,bitrate:5_000_000});
    expect(getResellerEncodingSettings(540,960,"high",{}))
      .toMatchObject({width:540,height:960,fps:30});
  });
  it("preserva dimensões pares e não estica vídeos pequenos",()=>{
    const q=getResellerEncodingSettings(853,479,"auto",{hardwareConcurrency:8});
    expect(q.width%2).toBe(0);
    expect(q.height%2).toBe(0);
    expect(q.width).toBeLessThanOrEqual(853);
    expect(q.height).toBeLessThanOrEqual(479);
  });
  it("recusa dimensões inválidas",()=>{
    expect(()=>getResellerEncodingSettings(0,1920)).toThrow(/inválidas/);
    expect(()=>getResellerEncodingSettings(Number.NaN,1920)).toThrow(/inválidas/);
  });
  it("mantém 24 fps médios numa tela de 60 Hz, sem cair para 20 fps",()=>{
    let next=0,painted=0;
    for(let i=0;i<600;i++){
      const now=i*1000/60;
      if(now+.001>=next){
        painted++;
        next=nextResellerFrameDeadline(now,next,24);
      }
    }
    expect(painted).toBeGreaterThanOrEqual(238);
    expect(painted).toBeLessThanOrEqual(241);
  });
  it("preserva 30 fps médios em modo de alta definição",()=>{
    let next=0,painted=0;
    for(let i=0;i<600;i++){
      const now=i*1000/60;
      if(now+.001>=next){
        painted++;
        next=nextResellerFrameDeadline(now,next,30);
      }
    }
    expect(painted).toBe(300);
  });
});
