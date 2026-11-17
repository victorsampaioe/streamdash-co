import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("./vitrine-video-template-render",()=>({
  renderResellerVideoMp4:vi.fn()
}));
import {renderResellerVideoMp4} from "./vitrine-video-template-render";
import {
  prepareVideoJobSource,startVideoExportInDocument,getVideoJobSnapshot,
  subscribeToVideoJob,dismissVideoJob,downloadVideoJob,isVideoJobRunning,
} from "./vitrine-video-background-job";

type FakeVideo={
  preload:string;playsInline:boolean;crossOrigin:string;controls:boolean;
  readyState:number;error:null;src:string;style:{cssText:string};
  setAttribute:(key:string,value:string)=>void;
  load:()=>void;pause:()=>void;removeAttribute:(key:string)=>void;remove:()=>void;
};
const players:FakeVideo[]=[];
const append=vi.fn();
beforeEach(()=>{
  vi.stubGlobal("document",{
    body:{appendChild:append},
    createElement:(tag:string)=>{
      if(tag!=="video")throw Error("Unexpected element "+tag);
      const v:FakeVideo={
        preload:"",playsInline:false,crossOrigin:"",controls:false,
        readyState:4,error:null,src:"",style:{cssText:""},
        setAttribute:vi.fn(),load:vi.fn(),pause:vi.fn(),
        removeAttribute:vi.fn(),remove:vi.fn()
      };
      players.push(v);return v;
    }
  });
});
afterEach(()=>{
  if(!isVideoJobRunning())dismissVideoJob();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  players.length=0;
});
const args={
  ownerId:"owner-one",modelId:"video-1",url:"https://streammonitor.site/private/model.mp4",
  title:"Novidade da semana",filename:"stream-monitor-novidade.mp4",
  audio:false,
  brand:{
    name:"Minha Revenda",whatsapp:"(85) 99854-5009",color:"#2563eb",
    logo:{naturalWidth:240,naturalHeight:96} as HTMLImageElement,
  }
};
describe("MP4 persistente na navegação",()=>{
  it("mantém a fonte fora da rota enquanto o MP4 gera e permite baixar quando pronto",async()=>{
    let finish!:(blob:Blob)=>void;
    vi.mocked(renderResellerVideoMp4).mockImplementation(()=>new Promise<Blob>(resolve=>{finish=resolve;}));
    const updates: string[]=[];
    const unsubscribe=subscribeToVideoJob(()=>updates.push(getVideoJobSnapshot().status));
    prepareVideoJobSource(args.modelId,args.url);
    expect(append).toHaveBeenCalledTimes(1);
    expect(players[0].src).toBe(args.url);
    startVideoExportInDocument(args);
    expect(getVideoJobSnapshot().status).toBe("preparing");
    expect(isVideoJobRunning()).toBe(true);
    // Simulate leaving the React page: there is no route-local cleanup to call,
    // so the DOM-owned source is still attached and rendering continues.
    unsubscribe();
    expect(vi.mocked(players[0].remove)).not.toHaveBeenCalled();
    finish(new Blob([new Uint8Array(8192)],{type:"video/mp4"}));
    await vi.waitFor(()=>expect(getVideoJobSnapshot().status).toBe("ready"));
    expect(getVideoJobSnapshot().percent).toBe(100);
    expect(getVideoJobSnapshot().filename).toBe("stream-monitor-novidade.mp4");
    expect(updates).toContain("preparing");
    expect(vi.mocked(players[0].remove)).toHaveBeenCalledTimes(1);
    expect(downloadVideoJob).toBeTypeOf("function");
  });
  it("não permite duas gerações simultâneas de revendas diferentes",async()=>{
    let finish!:(blob:Blob)=>void;
    vi.mocked(renderResellerVideoMp4).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    prepareVideoJobSource(args.modelId,args.url);
    startVideoExportInDocument(args);
    expect(()=>startVideoExportInDocument({...args,ownerId:"different"}))
      .toThrow(/Já existe um MP4/);
    finish(new Blob([new Uint8Array(8192)],{type:"video/mp4"}));
    await vi.waitFor(()=>expect(getVideoJobSnapshot().status).toBe("ready"));
  });
});
