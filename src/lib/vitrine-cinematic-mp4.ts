import type {CinematicOptions} from "./vitrine-cinematic-canvas";
import {paintCinematicVideoFrame,renderCinematic} from "./vitrine-cinematic-canvas";

export type ExportProgress={seconds:number;total:number;percent:number;stage:string};
export type Mp4Preset="whatsapp"|"full";

/** Native recording is only enabled for real MP4 H.264, never WebM with .mp4 extension. */
const preferredVideoCodecs=[
  'video/mp4;codecs="avc1.42E01E"',
  "video/mp4;codecs=avc1.42E01E",
];
const preferredAudioCodecs=[
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
];
export const WHATSAPP_VIDEO_MAX_BYTES=16*1024*1024;
export function supportedMp4Mime(withAudio:boolean){
  if(typeof MediaRecorder==="undefined")return null;
  return (withAudio?preferredAudioCodecs:preferredVideoCodecs)
    .find(type=>MediaRecorder.isTypeSupported(type))??null;
}
export function supportsCanvasMp4(withAudio:boolean){
  return !!supportedMp4Mime(withAudio)&&
    typeof HTMLCanvasElement!=="undefined"&&
    typeof HTMLCanvasElement.prototype.captureStream==="function";
}
export function renderDimensions(
  artwork:Pick<CinematicOptions,"width"|"height">,preset:Mp4Preset,
){
  const scale=preset==="whatsapp"?2/3:1;
  return {
    width:Math.max(2,Math.floor(artwork.width*scale/2)*2),
    height:Math.max(2,Math.floor(artwork.height*scale/2)*2),
    scale,
  };
}

/**
 * Export a real MP4 with the cinema artwork AND the user's actual video frames.
 * The large TMDB image, typography, lights and WhatsApp badge are drawn ONCE.
 * Only the inner video region is repainted at new source video frames, greatly
 * reducing dropped frames during real-time MediaRecorder encoding.
 *
 * WhatsApp preset is 720px wide, H.264 baseline + AAC when available,
 * with bitrate targeting under the 16 MB WhatsApp Business media limit.
 * Browser codecs determine the final container and may ignore bitrate hints.
 */
export async function renderNativeMp4(
  canvas:HTMLCanvasElement,
  source:HTMLVideoElement,
  artwork:Omit<CinematicOptions,"video">,
  seconds:15|30|60,
  startingAt:number,
  includeAudio:boolean,
  progress:(value:ExportProgress)=>void,
  preset:Mp4Preset="whatsapp",
):Promise<Blob>{
  const mime=supportedMp4Mime(includeAudio);
  if(!mime||!supportsCanvasMp4(includeAudio))
    throw new Error("Este navegador não oferece exportação MP4 H.264"+(includeAudio?"/AAC":"")+". Experimente um navegador compatível.");
  if(!Number.isFinite(source.duration)||source.duration<startingAt+seconds-0.15)
    throw new Error("O vídeo escolhido não contém todo o trecho selecionado.");

  const output=renderDimensions(artwork,preset);
  canvas.width=output.width;
  canvas.height=output.height;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Não foi possível iniciar o compositor de vídeo.");

  // Layout coordinates remain at the original 1080px design size.
  ctx.setTransform(output.scale,0,0,output.scale,0,0);
  let canvasStream:MediaStream|null=null;
  let audioContext:AudioContext|null=null;
  let audioSource:MediaElementAudioSourceNode|null=null;
  let recorder:MediaRecorder|null=null;
  let raf=0;
  let videoCallbackId=0;
  let watchId:ReturnType<typeof setTimeout>|null=null;
  let framesPainted=0;
  let timedOut=false;
  let stopped=false;

  const close=()=>{
    if(raf)cancelAnimationFrame(raf);
    if(videoCallbackId&&"cancelVideoFrameCallback" in source)
      source.cancelVideoFrameCallback(videoCallbackId);
    if(watchId)clearTimeout(watchId);
    try{
      if(recorder?.state!=="inactive")recorder?.stop();
    }catch{/* recorder may have already stopped */}
    source.pause();
    canvasStream?.getTracks().forEach(track=>track.stop());
    audioSource?.disconnect();
    if(audioContext&&audioContext.state!=="closed")void audioContext.close().catch(()=>{});
  };

  try{
    source.pause();
    if(Math.abs(source.currentTime-startingAt)>.055){
      await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error("Não foi possível posicionar o início do vídeo.")),7000);
        source.addEventListener("seeked",()=>{clearTimeout(timeout);resolve();},{once:true});
        source.currentTime=startingAt;
      });
    }

    // Decode the first frame before beginning to encode.
    if(source.readyState<2){
      await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error("O MP4 não forneceu quadros para reprodução.")),7000);
        source.addEventListener("loadeddata",()=>{clearTimeout(timeout);resolve();},{once:true});
        source.addEventListener("error",()=>{clearTimeout(timeout);reject(new Error("Falha ao decodificar o vídeo."));},{once:true});
      });
    }

    // IMPORTANT: do not redraw the full background and text at every frame.
    renderCinematic(ctx,{...artwork,video:null});
    paintCinematicVideoFrame(ctx,artwork,source);

    canvasStream=canvas.captureStream(30);
    if(includeAudio){
      audioContext=new AudioContext();
      audioSource=audioContext.createMediaElementSource(source);
      const audioOutput=audioContext.createMediaStreamDestination();
      audioSource.connect(audioOutput);
      // No extra speaker connection: prevents double playback/echo.
      source.muted=false;
      await audioContext.resume();
      const audioTracks=audioOutput.stream.getAudioTracks();
      if(!audioTracks.length)throw new Error("O navegador não disponibilizou áudio AAC.");
      for(const track of audioTracks)canvasStream.addTrack(track);
    }else source.muted=true;

    // Allow enough headroom for browser encoder variance and MP4 headers.
    const videoBitrate=preset==="whatsapp"
      ?(seconds===60?1_400_000:seconds===30?1_700_000:2_000_000)
      :5_000_000;
    const chunks:BlobPart[]=[];
    recorder=new MediaRecorder(canvasStream,{
      mimeType:mime,
      videoBitsPerSecond:videoBitrate,
      ...(includeAudio?{audioBitsPerSecond:96_000}:{}),
    });
    const active=recorder;
    const finished=new Promise<Blob>((resolve,reject)=>{
      active.addEventListener("dataavailable",event=>{
        if(event.data.size>0)chunks.push(event.data);
      });
      active.addEventListener("error",()=>reject(new Error("O navegador interrompeu a codificação MP4.")));
      active.addEventListener("stop",async()=>{
        try{
          const blob=new Blob(chunks,{type:active.mimeType||"video/mp4"});
          const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());
          if(blob.size<20_000||String.fromCharCode(...header.slice(4,8))!=="ftyp")
            throw new Error("O navegador não gerou um arquivo MP4 válido.");
          resolve(blob);
        }catch(error){reject(error);}
      });
    });

    const stop=()=>{
      if(stopped)return;
      stopped=true;
      if(active.state!=="inactive")active.stop();
    };
    source.addEventListener("ended",stop,{once:true});
    let lastPaintAt=-Infinity,lastReportAt=-Infinity;
    const paint=(now:number)=>{
      if(stopped)return;
      // Capture at most 30 FPS, never at the 60/120Hz screen refresh rate.
      if(now-lastPaintAt>=1000/30-3 && source.readyState>=2){
        paintCinematicVideoFrame(ctx,artwork,source);
        framesPainted++;
        lastPaintAt=now;
      }
      const elapsed=Math.max(0,source.currentTime-startingAt);
      if(now-lastReportAt>=350){
        progress({
          seconds:Math.min(seconds,elapsed),
          total:seconds,
          percent:Math.min(99,Math.round(elapsed/seconds*100)),
          stage:"Compondo vídeo e arte cinematográfica...",
        });
        lastReportAt=now;
      }
      if(elapsed>=seconds-0.03||source.ended)stop();
    };

    const onVideoFrame=(now:number)=>{
      paint(now);
      if(!stopped)videoCallbackId=source.requestVideoFrameCallback(onVideoFrame);
    };
    const onAnimationFrame=(now:number)=>{
      paint(now);
      if(!stopped)raf=requestAnimationFrame(onAnimationFrame);
    };

    active.start(1000);
    await source.play();
    if(typeof source.requestVideoFrameCallback==="function")
      videoCallbackId=source.requestVideoFrameCallback(onVideoFrame);
    else raf=requestAnimationFrame(onAnimationFrame);

    watchId=setTimeout(()=>{timedOut=true;stop();},(seconds+12)*1000);
    const blob=await finished;
    const played=Math.max(0,source.currentTime-startingAt);
    if(timedOut||played<seconds-0.35||framesPainted<seconds*9)
      throw new Error("A codificação perdeu muitos quadros ou foi interrompida. Tente o formato WhatsApp, que exige menos processamento.");
    progress({seconds,total:seconds,percent:100,stage:"MP4 validado"});
    return blob;
  }finally{
    close();
  }
}
