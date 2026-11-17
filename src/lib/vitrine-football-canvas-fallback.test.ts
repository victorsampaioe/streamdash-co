import { afterEach, describe, expect, it, vi } from "vitest";
import { drawFootballPngFallback } from "./vitrine-football-canvas-fallback";

afterEach(()=>vi.unstubAllGlobals());

describe("Vitrine Futebol: exportação completa no iPhone",()=>{
  it("desenha todos os escudos, o fundo, o WhatsApp e as duas logos num PNG",async()=>{
    const drawImage=vi.fn(),fillText=vi.fn();
    const gradient={addColorStop:vi.fn()};
    const ctx={
      save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),
      arcTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),fill:vi.fn(),
      stroke:vi.fn(),clip:vi.fn(),fillRect:vi.fn(),drawImage,fillText,
      translate:vi.fn(),scale:vi.fn(),
      createLinearGradient:vi.fn(()=>gradient),
      createRadialGradient:vi.fn(()=>gradient),
      measureText:vi.fn((value:string)=>({width:value.length*12})),
      filter:"",
    };
    const canvas={width:0,height:0,getContext:vi.fn(()=>ctx),
      toBlob:vi.fn((done:(value:Blob)=>void)=>done(
        new Blob([new Uint8Array(2000)],{type:"image/png"})
      ))
    };
    vi.stubGlobal("document",{createElement:vi.fn(()=>canvas)});
    vi.stubGlobal("Path2D",class {constructor(_path:string){}});
    class ImageMock {
      naturalWidth=160;naturalHeight=160;decoding="";
      onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
      private _src="";
      set src(next:string){
        this._src=next;
        queueMicrotask(()=>this.onload?.());
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
    const file=await drawFootballPngFallback({
      matches,day:"2026-11-17",accent:"#146df2",
      logo:"data:image/png;base64,minha-logo",
      playerPhoto:"",
      contact:"85998545009",name:"Minha Revenda",
      filename:"banner-completo.png",
    });
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
    expect(file.name).toBe("banner-completo.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(1000);
    // Stadium + watermark + top logo + eight crests + footer logo.
    expect(drawImage.mock.calls.length).toBeGreaterThanOrEqual(12);
    const labels=fillText.mock.calls.map(call=>String(call[0]));
    for(let i=0;i<4;i++){
      expect(labels).toContain("Equipe "+i);
      expect(labels).toContain("Adversário "+i);
    }
    expect(labels).toContain("(85) 99854-5009");
    expect(labels).toContain("FALE PELO WHATSAPP");
    expect(labels.filter(text=>text==="SporTV • Globo")).toHaveLength(4);
  });
});
