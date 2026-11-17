import {describe,it,expect,vi} from "vitest";
import {
  getOrCreateVideoAudioGraph,connectVideoAudioToStream,disposeVideoAudioGraph
} from "./vitrine-video-audio";

function audioHarness(){
  const connect=vi.fn();
  const disconnect=vi.fn();
  const createMediaElementSource=vi.fn(()=>({connect,disconnect} as unknown as MediaElementAudioSourceNode));
  const track={stop:vi.fn()} as unknown as MediaStreamTrack;
  const createMediaStreamDestination=vi.fn(()=>({
    stream:{getAudioTracks:()=>[track]}
  }) as unknown as MediaStreamAudioDestinationNode);
  const context={
    state:"running",
    createMediaElementSource,
    createMediaStreamDestination,
    resume:vi.fn(async()=>undefined),
    suspend:vi.fn(async()=>undefined),
    close:vi.fn(async()=>undefined)
  } as unknown as AudioContext;
  return {context,connect,disconnect,createMediaElementSource,
    createMediaStreamDestination,track};
}
describe("Vitrine MP4 - WebAudio reconnect",()=>{
  it("reutiliza um único MediaElementSourceNode em exports sucessivos do mesmo vídeo",async()=>{
    const fake=audioHarness();
    const video={muted:true} as HTMLVideoElement;
    const addTrack=vi.fn();
    const stream={addTrack} as unknown as MediaStream;
    // The first graph is created only once and cached by video element.
    expect(getOrCreateVideoAudioGraph(video,()=>fake.context).context).toBe(fake.context);
    const release1=await connectVideoAudioToStream(video,stream);
    expect(video.muted).toBe(false);
    expect(fake.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(fake.createMediaStreamDestination).toHaveBeenCalledTimes(1);
    expect(addTrack).toHaveBeenCalledTimes(1);
    release1();
    release1(); // idempotent cleanup
    // Second export would throw "already connected" before this fix.
    const release2=await connectVideoAudioToStream(video,stream);
    expect(fake.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(fake.createMediaStreamDestination).toHaveBeenCalledTimes(2);
    expect(addTrack).toHaveBeenCalledTimes(2);
    expect(fake.connect).toHaveBeenCalledTimes(2);
    expect(fake.context.close).not.toHaveBeenCalled();
    release2();
    disposeVideoAudioGraph(video);
    expect(fake.context.close).toHaveBeenCalledTimes(1);
  });
  it("permite fontes distintas sem compartilhar o áudio entre revendedores",()=>{
    const first=audioHarness(),second=audioHarness();
    const v1={} as HTMLVideoElement,v2={} as HTMLVideoElement;
    expect(getOrCreateVideoAudioGraph(v1,()=>first.context).context).toBe(first.context);
    expect(getOrCreateVideoAudioGraph(v2,()=>second.context).context).toBe(second.context);
    expect(first.createMediaElementSource).toHaveBeenCalledOnce();
    expect(second.createMediaElementSource).toHaveBeenCalledOnce();
    disposeVideoAudioGraph(v1);
    disposeVideoAudioGraph(v2);
  });
  it("mostra mensagem útil quando um outro script já associou a fonte",()=>{
    const fake=audioHarness();
    fake.createMediaElementSource.mockImplementation(()=>{
      throw new DOMException("already connected","InvalidStateError");
    });
    const video={} as HTMLVideoElement;
    expect(()=>getOrCreateVideoAudioGraph(video,()=>fake.context))
      .toThrow(/Atualize a página/);
    expect(fake.createMediaElementSource).toHaveBeenCalledOnce();
  });
});
