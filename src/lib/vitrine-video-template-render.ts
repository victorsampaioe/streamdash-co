import {formatCinematicWhatsApp} from "./vitrine-cinematic-canvas";
import {supportedMp4Mime} from "./vitrine-cinematic-mp4";
import {finalizeCinematicMp4} from "./vitrine-cinematic-whatsapp";

export type VideoOverlayBrand={
  name:string;whatsapp:string;color:string;logo:HTMLImageElement
};
export type VideoExportProgress={percent:number;stage:string};
/** Neutral palette shared by the MP4 compositor and the responsive preview. */
export const VIDEO_WHATSAPP_MONO={
  background:"rgba(0,0,0,.78)",
  border:"rgba(255,255,255,.72)",
  iconBackground:"#f5f5f5",
  iconText:"#101010",
  caption:"#d4d4d8",
  phone:"#ffffff",
} as const;
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const corner=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.roundRect(x,y,w,h,corner);ctx.closePath();
}
/** Stable branding geometry in native video coordinates.
 * A single frame-independent layout is used for the preview and EVERY MP4 frame.
 * The transparent logo is larger; the phone footer is intentionally compact.
 */
export function videoOverlayGeometry(width:number,height:number){
  const unit=Math.max(.1,Math.min(width/512,height/910));
  const phoneW=378*unit;
  return {
    scale:unit,
    logo:{x:22*unit,y:32*unit,w:170*unit,h:88*unit},
    whatsapp:{x:(width-phoneW)/2,y:815*unit,w:phoneW,h:51*unit},
  };
}
export function paintResellerVideoFrame(ctx:CanvasRenderingContext2D,
  source:HTMLVideoElement,brand:VideoOverlayBrand,width:number,height:number){
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle="#050914";ctx.fillRect(0,0,width,height);
  // Keep the source aspect ratio; do not deform the video.
  const sw=source.videoWidth||width,sh=source.videoHeight||height;
  const ratio=Math.min(width/sw,height/sh),w=sw*ratio,h=sh*ratio;
  ctx.drawImage(source,(width-w)/2,(height-h)/2,w,h);
  const layout=videoOverlayGeometry(width,height),unit=layout.scale;
  const logo=layout.logo;
  // Only render the normalized transparent logo: no dark rectangular matte.
  if(brand.logo?.naturalWidth>0){
    const logoScale=Math.min(logo.w/brand.logo.naturalWidth,logo.h/brand.logo.naturalHeight);
    const lw=brand.logo.naturalWidth*logoScale,lh=brand.logo.naturalHeight*logoScale;
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,.4)";
    ctx.shadowBlur=5*unit;
    ctx.drawImage(brand.logo,logo.x+(logo.w-lw)/2,logo.y+(logo.h-lh)/2,lw,lh);
    ctx.restore();
  }
  // Compact, consistently sized footer beneath the original device row.
  const phone=layout.whatsapp;
  ctx.save();ctx.shadowColor="rgba(0,0,0,.38)";ctx.shadowBlur=7*unit;
  ctx.fillStyle=VIDEO_WHATSAPP_MONO.background;
  rounded(ctx,phone.x,phone.y,phone.w,phone.h,11*unit);ctx.fill();
  ctx.strokeStyle=VIDEO_WHATSAPP_MONO.border;ctx.lineWidth=1.4*unit;ctx.stroke();ctx.restore();
  ctx.save();ctx.fillStyle=VIDEO_WHATSAPP_MONO.iconBackground;
  rounded(ctx,phone.x+10*unit,phone.y+10*unit,32*unit,31*unit,8*unit);ctx.fill();
  ctx.fillStyle=VIDEO_WHATSAPP_MONO.iconText;ctx.font="bold "+(18*unit)+"px Arial,sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText("☎",phone.x+26*unit,phone.y+25.5*unit);
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
  ctx.fillStyle=VIDEO_WHATSAPP_MONO.caption;ctx.font="bold "+(9*unit)+"px Arial,sans-serif";
  ctx.fillText("FALE PELO WHATSAPP",phone.x+52*unit,phone.y+18*unit);
  const label=formatCinematicWhatsApp(brand.whatsapp)||brand.whatsapp;
  let numberSize=18;
  do{
    ctx.font="bold "+(numberSize*unit)+"px Arial,sans-serif";
    if(ctx.measureText(label).width<phone.w-66*unit)break;
    numberSize-=1;
  }while(numberSize>=12);
  ctx.fillStyle=VIDEO_WHATSAPP_MONO.phone;ctx.fillText(label,phone.x+52*unit,phone.y+40*unit);
  ctx.restore();
}
export async function renderResellerVideoMp4(opts:{
  source:HTMLVideoElement;brand:VideoOverlayBrand;audio:boolean;
  progress:(progress:VideoExportProgress)=>void;signal?:AbortSignal;
}):Promise<Blob>{
  const {source,brand,audio,progress,signal}=opts;
  if(signal?.aborted)throw new Error("Exportação interrompida pela saída da conta.");
  if(!brand.logo||!brand.logo.naturalWidth)
    throw new Error("Cadastre a logo da revenda antes de gerar o vídeo.");
  if(!/^[\d\s()+-]{9,22}$/.test(brand.whatsapp))
    throw new Error("Cadastre um WhatsApp válido para colocar no vídeo.");
  const mime=supportedMp4Mime(audio)||
    (typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported("video/mp4")?"video/mp4":null);
  if(!mime||typeof HTMLCanvasElement==="undefined"||
      typeof HTMLCanvasElement.prototype.captureStream!=="function")
    throw new Error("Este navegador não permite exportar MP4. Tente no Chrome ou Safari atualizado.");
  if(!Number.isFinite(source.duration)||source.duration<1||source.duration>120)
    throw new Error("O vídeo deve ter entre 1 e 120 segundos.");
  const width=Math.round(source.videoWidth/2)*2;
  const height=Math.round(source.videoHeight/2)*2;
  if(width<128||height<128)throw new Error("Vídeo de entrada inválido.");
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Não foi possível iniciar o compositor.");
  const stream=canvas.captureStream(30);
  let audioCtx:AudioContext|null=null;
  let audioSrc:MediaElementAudioSourceNode|null=null;
  let recorder:MediaRecorder|null=null;
  let raf=0,callback=0,watchdog:ReturnType<typeof setTimeout>|null=null;
  let stopped=false,frames=0;
  let onAbort:(()=>void)|null=null;
  try{
    source.pause();
    if(source.currentTime>.05){
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("Falha ao voltar ao início.")),8000);
        source.addEventListener("seeked",()=>{clearTimeout(timer);resolve();},{once:true});
        source.currentTime=0;
      });
    }
    if(audio){
      audioCtx=new AudioContext();
      audioSrc=audioCtx.createMediaElementSource(source);
      const destination=audioCtx.createMediaStreamDestination();
      audioSrc.connect(destination);
      for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
      if(!destination.stream.getAudioTracks().length)
        throw new Error("Este navegador não permite capturar o áudio original.");
      source.muted=false;await audioCtx.resume();
    }else source.muted=true;
    paintResellerVideoFrame(ctx,source,brand,width,height);
    const chunks:BlobPart[]=[];
    recorder=new MediaRecorder(stream,{
      mimeType:mime,
      videoBitsPerSecond:width>=720?2_200_000:1_700_000,
      ...(audio?{audioBitsPerSecond:112_000}:{}),
    });
    const active=recorder;
    const finished=new Promise<Blob>((resolve,reject)=>{
      active.addEventListener("dataavailable",event=>{if(event.data.size)chunks.push(event.data);});
      active.addEventListener("error",()=>reject(new Error("O navegador interrompeu a exportação.")));
      active.addEventListener("stop",async()=>{
        try{
          const result=new Blob(chunks,{type:active.mimeType||"video/mp4"});
          const header=new Uint8Array(await result.slice(0,12).arrayBuffer());
          if(result.size<4096||String.fromCharCode(...header.slice(4,8))!=="ftyp")
            throw new Error("O navegador não exportou um MP4 válido.");
          resolve(result);
        }catch(err){reject(err);}
      });
    });
    const end=()=>{
      if(stopped)return;
      stopped=true;if(active.state!=="inactive")active.stop();
    };
    if(signal){
      onAbort=()=>{source.pause();end();};
      signal.addEventListener("abort",onAbort,{once:true});
      if(signal.aborted)onAbort();
    }
    source.addEventListener("ended",end,{once:true});
    let lastPaint=0,lastProgress=0;
    const draw=(now:number)=>{
      if(stopped)return;
      if(now-lastPaint>29&&source.readyState>=2){
        paintResellerVideoFrame(ctx,source,brand,width,height);
        frames++;lastPaint=now;
      }
      if(now-lastProgress>350){
        progress({percent:Math.min(99,Math.floor(source.currentTime/source.duration*100)),
          stage:"Aplicando a logo e o WhatsApp em todos os quadros..."});
        lastProgress=now;
      }
      if(source.ended||source.currentTime>=source.duration-.035)end();
    };
    const videoFrame=(now:number)=>{
      draw(now);
      if(!stopped&&typeof source.requestVideoFrameCallback==="function")
        callback=source.requestVideoFrameCallback(videoFrame);
    };
    const animate=(now:number)=>{draw(now);if(!stopped)raf=requestAnimationFrame(animate);};
    active.start(900);
    await source.play();
    if(typeof source.requestVideoFrameCallback==="function")
      callback=source.requestVideoFrameCallback(videoFrame);
    else raf=requestAnimationFrame(animate);
    watchdog=setTimeout(end,(source.duration+14)*1000);
    const blob=await finished;
    if(signal?.aborted)throw new Error("Exportação cancelada por segurança.");
    if(source.currentTime<source.duration-.4 || frames<source.duration*6)
      throw new Error("A exportação foi interrompida. O vídeo original permanece intacto.");
    progress({percent:99,stage:"Finalizando MP4 para WhatsApp..."});
    const output=await finalizeCinematicMp4(blob);
    progress({percent:100,stage:"MP4 pronto"});
    return output;
  }finally{
    if(onAbort&&signal)signal.removeEventListener("abort",onAbort);
    if(raf)cancelAnimationFrame(raf);
    if(callback&&typeof source.cancelVideoFrameCallback==="function")
      source.cancelVideoFrameCallback(callback);
    if(watchdog)clearTimeout(watchdog);
    source.pause();
    try{if(recorder?.state!=="inactive")recorder?.stop();}catch{/*already closed*/}
    stream.getTracks().forEach(track=>track.stop());
    audioSrc?.disconnect();
    if(audioCtx&&audioCtx.state!=="closed")void audioCtx.close().catch(()=>{});
    canvas.width=canvas.height=0;
  }
}
