import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toCanvas } from "html-to-image";
import {
  createFootballArtworkFile,
  describeExportError,
} from "./vitrine-football-dom-export";

vi.mock("html-to-image", () => ({ toCanvas: vi.fn() }));

function pngBlob(width=1080,height=1080):Blob {
  const bytes=new Uint8Array(1600);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
  bytes.set([73,72,68,82],12);
  new DataView(bytes.buffer).setUint32(16,width);
  new DataView(bytes.buffer).setUint32(20,height);
  return new Blob([bytes],{type:"image/png"});
}

function harness(options?:{images?:number; width?:number; height?:number}) {
  const drawImage=vi.fn();
  const context={drawImage,save:vi.fn(),restore:vi.fn()};
  const canvas={
    width:1080,height:1080,
    getContext:vi.fn(()=>context),
    toBlob:vi.fn((callback:(blob:Blob|null)=>void)=>callback(pngBlob())),
  };
  const images=Array.from({length:options?.images??3},(_,index)=>({
    src:"data:image/png;base64,AA",
    currentSrc:"data:image/png;base64,AA",
    complete:true,naturalWidth:130,naturalHeight:130,
    offsetWidth:49,offsetHeight:49,
    decode:()=>Promise.resolve(),
    getBoundingClientRect:()=>({left:50+index*60,top:100,width:49,height:49}),
  }));
  const source={
    getBoundingClientRect:()=>({
      left:0,top:0,width:options?.width??1080,height:options?.height??1080,
    }),
    querySelectorAll:()=>images,
  } as unknown as HTMLDivElement;
  vi.stubGlobal("document",{
    createElement:vi.fn(()=>canvas),
    location:{origin:"https://streammonitor.site"},
  });
  vi.stubGlobal("getComputedStyle",vi.fn(()=>({
    objectPosition:"center center",display:"block",
  })));
  vi.stubGlobal("navigator",{userAgent:"Mozilla/5.0 Chrome/124.0.0.0"});
  vi.mocked(toCanvas).mockResolvedValue(canvas as unknown as HTMLCanvasElement);
  return {source,canvas,images,drawImage};
}

beforeEach(()=>vi.resetAllMocks());
afterEach(()=>vi.unstubAllGlobals());

describe("Vitrine Futebol — exportação PNG 1080 × 1080",()=>{
  it("usa o mesmo DOM integral da prévia, mantém 3 imagens do banner e gera arquivo verificável",async()=>{
    const {source,drawImage}=harness();
    const file=await createFootballArtworkFile(source,"banner-futebol.png");
    expect(file.name).toBe("banner-futebol.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(1600);
    expect(toCanvas).toHaveBeenCalledWith(source,expect.objectContaining({
      width:1080,height:1080,pixelRatio:1,skipFonts:true,
      backgroundColor:"#071227",
      style:expect.objectContaining({transform:"none",transformOrigin:"top left"}),
    }));
    // Escudos/logos são pintados sobre a captura completa do próprio componente.
    expect(drawImage).toHaveBeenCalledTimes(3);
    const bytes=new DataView(await file.slice(0,24).arrayBuffer());
    expect(bytes.getUint32(16)).toBe(1080);
    expect(bytes.getUint32(20)).toBe(1080);
  });

  it("rejeita elemento cortado ou menor que 1080 pixels sem produzir PNG falso",async()=>{
    const {source}=harness({width:540,height:540});
    await expect(createFootballArtworkFile(source,"partial.png"))
      .rejects.toThrow("1080");
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it("faz pré-captura adicional no WebKit/Safari e depois usa a segunda captura",async()=>{
    const {source,canvas}=harness({images:0});
    const warm={...canvas,width:1080,height:1080};
    vi.stubGlobal("navigator",{userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"});
    vi.mocked(toCanvas).mockReset();
    vi.mocked(toCanvas).mockResolvedValueOnce(warm as unknown as HTMLCanvasElement)
      .mockResolvedValueOnce(canvas as unknown as HTMLCanvasElement);
    const file=await createFootballArtworkFile(source,"safari.png");
    expect(toCanvas).toHaveBeenCalledTimes(2);
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(1000);
  });

  it("converte falha DOM Event do Safari em mensagem legível",async()=>{
    const {source}=harness({images:0});
    vi.mocked(toCanvas).mockRejectedValue(new Event("error"));
    await expect(createFootballArtworkFile(source,"error.png"))
      .rejects.toThrow(/Evento error ao carregar/);
    expect(describeExportError(new Event("error"))).toContain("Evento error");
  });

  it("não aceita arquivo com dimensões adulteradas",async()=>{
    const {source,canvas}=harness({images:0});
    canvas.toBlob.mockImplementation((callback:(blob:Blob|null)=>void)=>
      callback(pngBlob(1080,720)));
    await expect(createFootballArtworkFile(source,"bad.png"))
      .rejects.toThrow("1080 × 1080");
  });

  it("mantém exportação mesmo se uma imagem remota bloqueada não puder ser otimizada",async()=>{
    const {source,canvas}=harness({images:0});
    const blocked={
      src:"https://example.invalid/blocked.png",
      currentSrc:"https://example.invalid/blocked.png",
      complete:true,naturalWidth:1500,naturalHeight:1500,
      offsetWidth:45,offsetHeight:45,
      decode:()=>Promise.resolve(),
      getAttribute:(name:string)=>name==="src"?"https://example.invalid/blocked.png":null,
      removeAttribute:vi.fn(),
      getBoundingClientRect:()=>({left:0,top:0,width:45,height:45}),
    };
    const ctx=canvas.getContext();
    ctx.drawImage.mockImplementationOnce(()=>{throw new Error("The canvas is tainted");});
    Object.assign(source,{querySelectorAll:vi.fn(()=>[blocked])});
    const file=await createFootballArtworkFile(source,"blocked.png");
    expect(file.size).toBeGreaterThan(1000);
  });

  it("não descarta mensagem quando o erro não é Error",()=>{
    expect(describeExportError("falha de imagem")).toBe("falha de imagem");
    expect(describeExportError({reason:"CORS"})).toContain("CORS");
  });
});
