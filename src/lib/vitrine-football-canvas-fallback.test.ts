import { afterEach, describe, expect, it, vi } from "vitest";
import { drawFootballPngFallback, fallbackBadgeLabel, FOOTBALL_PNG_WIDTH, FOOTBALL_PNG_HEIGHT } from "./vitrine-football-canvas-fallback";
afterEach(()=>vi.unstubAllGlobals());

const validBlob=()=>{
  const bytes=new Uint8Array(4000);
  bytes.set([137,80,78,71,13,10,26,10],0);
  bytes.set([73,72,68,82],12);
  new DataView(bytes.buffer).setUint32(16,2160);
  new DataView(bytes.buffer).setUint32(20,2700);
  return new Blob([bytes],{type:"image/png"});
};
function setup(blockedSource?:string){
  const drawImage=vi.fn(),fillText=vi.fn();
  const gradient={addColorStop:vi.fn()};
  const ctx={
    save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),
    arcTo:vi.fn(),arc:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),fill:vi.fn(),
    stroke:vi.fn(),clip:vi.fn(),fillRect:vi.fn(),drawImage,fillText,
    translate:vi.fn(),scale:vi.fn(),
    createLinearGradient:vi.fn(()=>gradient),
    createRadialGradient:vi.fn(()=>gradient),
    measureText:vi.fn((value:string)=>({width:value.length*12})),filter:"",
  };
  const dimensions:{width:number;height:number}[]=[];
  const canvas={width:0,height:0,getContext:vi.fn(()=>ctx),
    toBlob:vi.fn((done:(value:Blob)=>void)=>{
      dimensions.push({width:canvas.width,height:canvas.height});
      done(validBlob());
    }),
  };
  vi.stubGlobal("document",{createElement:vi.fn(()=>canvas)});
  class ImageMock {
    naturalWidth=160;naturalHeight=160;decoding="";
    onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
    private _src="";
    set src(next:string){
      this._src=next;
      queueMicrotask(()=>{
        if(next===blockedSource)this.onerror?.();
        else this.onload?.();
      });
    }
    get src(){return this._src;}
  }
  vi.stubGlobal("Image",ImageMock);
  const matches=[0,1,2,3].map(i=>({
    id:"jogo"+i,home:"Equipe "+i,away:"Adversário "+i,
    league:"Liga das Nações",time:"16:45",
    homeBadge:"data:image/png;base64,home"+i,
    awayBadge:"data:image/png;base64,away"+i,
    broadcasts:["SporTV","Globo"],
  })) as any;
  const config={
    matches,day:"2026-11-17",accent:"#146df2",
    logo:"data:image/png;base64,minha-logo",playerPhoto:"",
    contact:"85998545009",name:"Minha Revenda",filename:"banner-completo.png",
  };
  return {canvas,ctx,drawImage,fillText,dimensions,config};
}

describe("Vitrine Futebol: PNG nativo idêntico à prévia e Telegram",()=>{
  it("renderiza 2160×2700 reais, todos os 8 escudos, fontes e WhatsApp",async()=>{
    const {canvas,drawImage,fillText,dimensions,ctx,config}=setup();
    const file=await drawFootballPngFallback(config);
    expect(FOOTBALL_PNG_WIDTH).toBe(2160);
    expect(FOOTBALL_PNG_HEIGHT).toBe(2700);
    expect(dimensions).toEqual([{width:2160,height:2700}]);
    expect(ctx.scale).toHaveBeenCalledWith(2,2);
    expect(file.name).toBe("banner-completo.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(1000);
    // Original approved art: top brand + small footer brand and eight crests.
    const logos=drawImage.mock.calls.filter(call=>call[0]?.src==="data:image/png;base64,minha-logo");
    expect(logos).toHaveLength(2);
    for(let i=0;i<4;i++){
      expect(drawImage.mock.calls.some(call=>call[0]?.src==="data:image/png;base64,home"+i)).toBe(true);
      expect(drawImage.mock.calls.some(call=>call[0]?.src==="data:image/png;base64,away"+i)).toBe(true);
    }
    const labels=fillText.mock.calls.map(call=>String(call[0]));
    for(let i=0;i<4;i++){
      expect(labels).toContain("Equipe "+i);
      expect(labels).toContain("Adversário "+i);
    }
    expect(labels).toContain("(85) 99854-5009");
    expect(labels).toContain("FALE PELO WHATSAPP");
    expect(labels).toContain("EVENTOS");
    expect(labels).toContain("DE HOJE");
    expect(labels.filter(t=>t==="SporTV • Globo")).toHaveLength(4);
    expect(canvas.width).toBe(0); // high memory canvas released after PNG
  });
  it("gera arte completa se um escudo externo falhar, mostrando iniciais em vez de espaço vazio",async()=>{
    const blocked="data:image/png;base64,away1";
    const {config,canvas,fillText}=setup(blocked);
    const file=await drawFootballPngFallback(config);
    expect(file.type).toBe("image/png");
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    expect(fillText.mock.calls.map(c=>c[0])).toContain("A1");
  });
  it("substitui bandeira bloqueada de Singapura pelo emoji correto, sem bloquear a prévia",async()=>{
    const blocked="data:image/png;base64,sgblocked";
    const {config,canvas,fillText,drawImage}=setup(blocked);
    config.matches[0]={...config.matches[0],
      home:"Singapore",away:"Brazil",league:"Amistoso Internacional",homeBadge:blocked};
    await drawFootballPngFallback(config);
    // The renderer must draw the real circular SG flag SVG, not a text emoji.
    expect(fillText.mock.calls.map(c=>c[0])).not.toContain("🇸🇬");
    expect(fillText.mock.calls.map(c=>c[0])).toContain("Singapura");
    expect(drawImage.mock.calls.some(call=>String(call[0]?.src).startsWith("data:image/svg+xml")&&String(call[0]?.src).includes("%3Csvg"))).toBe(true);
    expect(canvas.toBlob).toHaveBeenCalledOnce();
  });
  it("não atribui bandeira de país ao clube por engano",()=>{
    expect(fallbackBadgeLabel("Flamengo","Brasileirão Série A")).toBe("F");
    expect(fallbackBadgeLabel("Singapore","Amistoso Internacional")).toBe("🇸🇬");
    expect(fallbackBadgeLabel("Wales","Liga das Nações")).toBe("PG");
  });
  it("não permite exportar arquivo se a logo da revenda falhar",async()=>{
    const blocked="data:image/png;base64,minha-logo";
    const {config,canvas}=setup(blocked);
    await expect(drawFootballPngFallback(config)).rejects.toThrow(/logo do revendedor/i);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });
  it("mantém nomes brasileiros longos em duas linhas e suporta uma única partida",async()=>{
    const {config,fillText,dimensions}=setup();
    config.matches=[{...config.matches[0],home:"Wales",away:"Singapore",
      broadcasts:["Disney+","Globo","SporTV"]}];
    await drawFootballPngFallback(config);
    const labels=fillText.mock.calls.map(call=>String(call[0]));
    expect(labels).toContain("País de Gales");
    expect(labels).toContain("Singapura");
    expect(dimensions[0]).toEqual({width:2160,height:2700});
  });
});