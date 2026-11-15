import type {CinematicOptions} from "./vitrine-cinematic-canvas";
import {renderCinematic} from "./vitrine-cinematic-canvas";

export type ExportProgress={seconds:number,total:number,percent:number,stage:string};
const preferredVideoCodecs=[
  'video/mp4;codecs="avc1.42E01E"',
  "video/mp4;codecs=avc1.42E01E",
];
const preferredAudioCodecs=[
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
];

export function supportedMp4Mime(withAudio:boolean){
  if(typeof MediaRecorder==="undefined")return null;
  return (withAudio?preferredAudioCodecs:preferredVideoCodecs)
    .find(x=>MediaRecorder.isTypeSupported(x))??null;
}
export function supportsCanvasMp4(withAudio:boolean){
  return !!supportedMp4Mime(withAudio)&&
    typeof HTMLCanvasElement!=="undefined"&&
    typeof HTMLCanvasElement.prototype.captureStream==="function";
}

export async function renderNativeMp4(
  canvas:HTMLCanvasElement,
  source:HTMLVideoElement,
  artwork:Omit<CinematicOptions,"video">,
  seconds:15|30|60,
  startingAt:number,
  includeAudio:boolean,
  progress:(value:ExportProgress)=>void,
):Promise<Blob>{
  const mime=supportedMp4Mime(includeAudio);
  if(!mime||!supportsCanvasMp4(includeAudio)){
    throw new Error("Este navegador não oferece exportação nativa H.264/AAC em MP4. Use outro navegador compatível ou gere o PNG, sem converter para WebM.");
  }
  if(!Number.isFinite(source.duration)||source.duration<startingAt+seconds-0.15)
    throw new Error("O MP4 enviado não contém o trecho completo selecionado.");
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Canvas não disponível.");
  const videoStream=canvas.captureStream(30);
  let audioContext:AudioContext|null=null;
  let audioSource:MediaElementAudioSourceNode|null=null;
  let audioOutput:MediaStreamAudioDestinationNode|null=null;
  let recording:MediaRecorder|null=null;
  let raf=0;
  let timeoutId:ReturnType<typeof setTimeout>|null=null;
  const cleanup=()=>{
    if(raf)cancelAnimationFrame(raf);
    if(timeoutId)clearTimeout(timeoutId);
    source.pause();
    videoStream.getTracks().forEach(x=>x.stop());
    audioSource?.disconnect();
    if(audioContext&&audioContext.state!=="closed")void audioContext.close().catch(()=>{});
  };
  try{
    // A fresh media element is required for each export; the calling component
    // must not reuse the same element with createMediaElementSource().
    source.pause();
    if(Math.abs(source.currentTime-startingAt)>.05){
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("Tempo esgotado ao posicionar o vídeo.")),5000);
        source.addEventListener("seeked",()=>{clearTimeout(timer);resolve()},{once:true});
        source.currentTime=startingAt;
      });
    }
    source.muted=!includeAudio;
    if(includeAudio){
      audioContext=new AudioContext();
      audioSource=audioContext.createMediaElementSource(source);
      audioOutput=audioContext.createMediaStreamDestination();
      audioSource.connect(audioOutput);
      // The source element has an audible output only during authorized export.
      audioSource.connect(audioContext.destination);
      await audioContext.resume();
      for(const track of audioOutput.stream.getAudioTracks())videoStream.addTrack(track);
      if(videoStream.getAudioTracks().length===0)
        throw new Error("Não foi possível incluir áudio AAC no MP4.");
    }
    const chunks:BlobPart[]=[];
    recording=new MediaRecorder(videoStream,{mimeType:mime,videoBitsPerSecond:8_000_000,audioBitsPerSecond:128_000});
    const recorder=recording;
    const completed=new Promise<Blob>((resolve,reject)=>{
      recorder.addEventListener("dataavailable",ev=>{if(ev.data.size>0)chunks.push(ev.data);});
      recorder.addEventListener("error",()=>reject(new Error("O navegador interrompeu a gravação H.264.")));
      recorder.addEventListener("stop",async()=>{
        const blob=new Blob(chunks,{type:recorder.mimeType});
        try{
          const magic=new Uint8Array(await blob.slice(0,12).arrayBuffer());
          const signature=String.fromCharCode(...magic.slice(4,8));
          if(blob.size<50000||signature!=="ftyp")throw new Error("O navegador não gerou um arquivo MP4 válido.");
          resolve(blob);
        }catch(e){reject(e);}
      });
    });
    let stopped=false;
    let elapsed=0;
    const stop=()=>{
      if(stopped)return;
      stopped=true;
      if(raf)cancelAnimationFrame(raf);
      source.pause();
      if(recorder.state!=="inactive")recorder.stop();
    };
    const draw=()=>{
      elapsed=Math.max(0,source.currentTime-startingAt);
      renderCinematic(ctx,{...artwork,video:source});
      progress({
        seconds:Math.min(seconds,elapsed),total:seconds,
        percent:Math.min(99,Math.round(elapsed/seconds*100)),
        stage:"Renderizando quadros reais e áudio",
      });
      if(elapsed>=seconds||source.ended){stop();return;}
      raf=requestAnimationFrame(draw);
    };
    source.addEventListener("ended",stop,{once:true});
    renderCinematic(ctx,{...artwork,video:source});
    recorder.start(500);
    await source.play();
    raf=requestAnimationFrame(draw);
    // Watchdog prevents hanging MediaRecorder indefinitely.
    timeoutId=setTimeout(stop,(seconds+10)*1000);
    const blob=await completed;
    progress({seconds,total:seconds,percent:100,stage:"MP4 validado"});
    return blob;
  }finally{
    cleanup();
  }
}
