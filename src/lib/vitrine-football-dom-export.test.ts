import { afterEach,describe,expect,it,vi } from "vitest";
import { toPng } from "html-to-image";
import { createFootballArtworkFile } from "./vitrine-football-dom-export";

vi.mock("html-to-image",()=>({
  toPng:vi.fn(async()=>"data:image/png;base64,AAAA")
}));
afterEach(()=>vi.unstubAllGlobals());
describe("Vitrine Futebol — mesma arte da Vitrine Banner",()=>{
  it("exporta 1080x1080 pela prévia verdadeira e inclui escudos e logos",async()=>{
    const drawImage=vi.fn();
    const ctx={drawImage,toBlob:vi.fn((done:(blob:Blob)=>void)=>{
      const bytes=new Uint8Array(1600);
      bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
      bytes.set([73,72,68,82],12);
      new DataView(bytes.buffer).setUint32(16,1080);
      new DataView(bytes.buffer).setUint32(20,1080);
      done(new Blob([bytes],{type:"image/png"}));
    }),save:vi.fn(),restore:vi.fn()};
    const canvas={width:0,height:0,getContext:vi.fn(()=>ctx)};
    vi.stubGlobal("document",{createElement:vi.fn(()=>canvas)});
    vi.stubGlobal("getComputedStyle",vi.fn(()=>({objectPosition:"center center"})));
    class Img{
      naturalWidth=130;naturalHeight=130;complete=true;
      onload:(()=>void)|null=null;
      onerror:(()=>void)|null=null;
      set src(_value:string){queueMicrotask(()=>this.onload?.())}
      getBoundingClientRect(){return {left:100,top:100,width:49,height:49}}
    }
    vi.stubGlobal("Image",Img);
    const imgs=[new Img(),new Img(),new Img()];
    const source={
      getBoundingClientRect:()=>({left:-1800,top:0,width:1080,height:1080}),
      querySelectorAll:()=>imgs
    } as unknown as HTMLDivElement;
    const file=await createFootballArtworkFile(source,"banner-futebol.png");
    expect(file.name).toBe("banner-futebol.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(1600);
    expect(toPng).toHaveBeenCalledWith(source,expect.objectContaining({
      width:1080,height:1080,pixelRatio:1,skipFonts:true,
      style:{transform:"none",transformOrigin:"top left"}
    }));
    // Screenshot + two team crests + one reseller logo, all from the actual DOM.
    expect(drawImage).toHaveBeenCalledTimes(4);
  });
});
