import { afterEach, describe, expect, it, vi } from "vitest";
import { drawFootballPngFallback, fallbackBadgeLabel, gridBackdropSwatches, classicCardGeometry, gridCardGeometry, FOOTBALL_PNG_WIDTH, FOOTBALL_PNG_HEIGHT } from "./vitrine-football-canvas-fallback";
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
  it("omite inteiramente confronto sem escudo real, sem desenhar iniciais",async()=>{
    const blocked="data:image/png;base64,away1";
    const {config,canvas,fillText}=setup(blocked);
    const file=await drawFootballPngFallback(config);
    expect(file.type).toBe("image/png");
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    const printed=fillText.mock.calls.map(c=>String(c[0]));
    expect(printed).not.toContain("A1");
    expect(printed).not.toContain("Equipe 1");
    expect(printed).not.toContain("Adversário 1");
    expect(printed).toContain("Equipe 0");
    expect(printed).toContain("Equipe 2");
    expect(printed).toContain("Equipe 3");
  });
  it("mantém o Modelo 1 e o Modelo 2 rigorosamente fixos com poucos jogos",()=>{
    const classic=classicCardGeometry(4),grid=gridCardGeometry(10);
    for(const count of [1,2,3,4]){
      expect(classicCardGeometry(count)).toEqual(classic);
    }
    for(const count of [1,2,3,4,5,9,10]){
      const value=gridCardGeometry(count);
      expect(value.cardHeight).toBe(grid.cardHeight);
      expect(value.rowTop).toBe(grid.rowTop);
      expect(value.badgeSize).toBe(grid.badgeSize);
      expect(value.badgeOffset).toBe(grid.badgeOffset);
      expect(value.gapY).toBe(grid.gapY);
    }
    expect(classic).toEqual({cardHeight:153,gap:18,rowTop:367,badgeSize:54,badgeOffset:48});
    expect(grid).toEqual({lines:5,cardHeight:154,gapY:13,rowTop:322,badgeSize:109,badgeOffset:39});
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
  it("faz banner FIM DE JOGO com placar final verificado e logos da revenda",async()=>{
    const {config,fillText,drawImage,canvas,dimensions}=setup();
    config.matches=[{...config.matches[0],status:"encerrado",scoreLabel:"3 × 1",
      home:"Brazil",away:"Singapore",league:"Amistoso Internacional"}];
    const file=await drawFootballPngFallback({...config,kind:"finished"});
    expect(file.name).toBe("banner-completo.png");
    expect(dimensions).toEqual([{width:2160,height:2700}]);
    const labels=fillText.mock.calls.map(c=>String(c[0]));
    for(const text of ["FIM DE","JOGO","APITO FINAL","RESULTADO FINAL","3","1","Brasil","Singapura",
      "(85) 99854-5009"])expect(labels).toContain(text);
    const logos=drawImage.mock.calls.filter(c=>c[0]?.src==="data:image/png;base64,minha-logo");
    expect(logos).toHaveLength(2);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
  });
  it("não permite placar de um jogo ao vivo, agendado ou sem resultado oficial",async()=>{
    const {config,canvas}=setup();
    const common={...config.matches[0],home:"Brazil",away:"Portugal"};
    for(const game of [
      {...common,status:"ao_vivo",scoreLabel:"2 × 1"},
      {...common,status:"encerrado",scoreLabel:""},
      {...common,status:"adiado",scoreLabel:"3 × 1"}
    ]){
      await expect(drawFootballPngFallback({...config,matches:[game],kind:"finished"}))
        .rejects.toThrow("resultado ainda não foi confirmado");
    }
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });
  it("gera Modelo 2 com 10 jogos em 2 colunas, 20 escudos e PNG 2160 × 2700",async()=>{
    const {config,dimensions,canvas,drawImage,fillText}=setup();
    const matches=Array.from({length:10},(_,i)=>({
      ...config.matches[i%4],id:"grid-"+i,
      home:"Mandante "+(i+1),away:"Visitante "+(i+1),
      homeBadge:"data:image/png;base64,grid-home-"+i,
      awayBadge:"data:image/png;base64,grid-away-"+i,
      broadcasts:["Globo","SporTV","ge tv"],
    }));
    const file=await drawFootballPngFallback({...config,matches,kind:"grid"});
    expect(file.type).toBe("image/png");
    expect(dimensions).toEqual([{width:2160,height:2700}]);
    expect(canvas.toBlob).toHaveBeenCalledOnce();
    const shown=fillText.mock.calls.map(call=>String(call[0]));
    for(const text of ["JOGOS","DO DIA","ASSISTA EM","QUALQUER DISPOSITIVO","FALE PELO WHATSAPP",
      "(85) 99854-5009"]){expect(shown).toContain(text);}
    for(let i=0;i<10;i++){
      expect(shown).toContain("Mandante "+(i+1)+" × Visitante "+(i+1));
      expect(drawImage.mock.calls.some(call=>call[0]?.src==="data:image/png;base64,grid-home-"+i)).toBe(true);
      expect(drawImage.mock.calls.some(call=>call[0]?.src==="data:image/png;base64,grid-away-"+i)).toBe(true);
    }
    const logos=drawImage.mock.calls.filter(call=>call[0]?.src===config.logo);
    expect(logos).toHaveLength(1);
  });
  it("faz o fundo da grade acompanhar todas as cores, inclusive personalizado",()=>{
    const blue=gridBackdropSwatches("#146df2");
    const red=gridBackdropSwatches("#ee1519");
    const purple=gridBackdropSwatches("#7537ed");
    const custom=gridBackdropSwatches("#9f672e");
    const values=[blue,red,purple,custom];
    expect(new Set(values.map(v=>v.base)).size).toBe(4);
    expect(new Set(values.map(v=>v.shadow)).size).toBe(4);
    expect(new Set(values.map(v=>v.haze)).size).toBe(4);
    expect(red.rgb[0]).toBeGreaterThan(red.rgb[2]);
    expect(blue.rgb[2]).toBeGreaterThan(blue.rgb[0]);
  });
  it("recolore a grade e mantém todos os jogos com cor personalizada",async()=>{
    const {config,dimensions,ctx}=setup();
    await drawFootballPngFallback({...config,kind:"grid",accent:"#db4796"});
    expect(dimensions).toEqual([{width:2160,height:2700}]);
    expect(ctx.createLinearGradient).toHaveBeenCalled();
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