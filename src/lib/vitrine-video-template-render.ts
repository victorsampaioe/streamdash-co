import {formatCinematicWhatsApp} from "./vitrine-cinematic-canvas";
import {supportedMp4Mime} from "./vitrine-cinematic-mp4";
import {finalizeCinematicMp4} from "./vitrine-cinematic-whatsapp";
import {connectVideoAudioToStream} from "./vitrine-video-audio";
import {getResellerEncodingSettings,type ResellerVideoQuality} from "./vitrine-video-quality";

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
  paintResellerVideoOverlay(ctx,brand,width,height);
}
/** Draw the static branding once per export, not 24-30 times a second. */
export function paintResellerVideoOverlay(
  ctx:CanvasRenderingContext2D,brand:VideoOverlayBrand,width:number,height:number,
){
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
  quality?:ResellerVideoQuality;
  progress:(progress:VideoExportProgress)=>void;signal?:AbortSignal;
}):Promise<Blob>{
  const {source,brand,audio,progress,signal,quality="auto"}=opts;
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
  const settings=getResellerEncodingSettings(source.videoWidth,source.videoHeight,quality);
  const {width,height}=settings;
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Não foi possível iniciar o compositor.");
  // Cache the transparent logo and contact once, preserving the original design.
  const overlay=document.createElement("canvas");overlay.width=width;overlay.height=height;
  const overlayCtx=overlay.getContext("2d",{alpha:true});
  if(!overlayCtx)throw new Error("Não foi possível criar a camada da marca.");
  paintResellerVideoOverlay(overlayCtx,brand,width,height);
  const renderFrame=()=>{
    ctx.fillStyle="#050914";ctx.fillRect(0,0,width,height);
    const sw=source.videoWidth||width,sh=source.videoHeight||height;
    const factor=Math.min(width/sw,height/sh);
    ctx.drawImage(source,(width-sw*factor)/2,(height-sh*factor)/2,sw*factor,sh*factor);
    ctx.drawImage(overlay,0,0,width,height);
  };
  const stream=canvas.captureStream(settings.fps);
  let disconnectAudio:(()=>void)|null=null;
  let recorder:MediaRecorder|null=null;
  let raf=0,watchdog:ReturnType<typeof setInterval>|null=null;
  let stopped=false,frames=0;
  let prematureStopReason="";
  let onAbort:(()=>void)|null=null;
  let onEnded:(()=>void)|null=null;
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
      // Reuse the existing MediaElementAudioSourceNode across retries.
      // Browsers permanently associate this node with the video element:
      // creating a new one is an InvalidStateError on the second export.
      disconnectAudio=await connectVideoAudioToStream(source,stream);
    }else source.muted=true;
    renderFrame();
    const chunks:BlobPart[]=[];
    recorder=new MediaRecorder(stream,{
      mimeType:mime,
      videoBitsPerSecond:settings.bitrate,
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
    onEnded=end;
    source.addEventListener("ended",onEnded,{once:true});
    let lastPaint=0,lastProgress=0;
    const draw=(now:number)=>{
      if(stopped)return;
      if(now-lastPaint>=1000/settings.fps-2&&source.readyState>=2){
        renderFrame();
        frames++;lastPaint=now;
      }
      if(now-lastProgress>350){
        progress({percent:Math.min(99,Math.floor(source.currentTime/source.duration*100)),
          stage:"Aplicando a logo e o WhatsApp em todos os quadros..."});
        lastProgress=now;
      }
      if(source.ended||source.currentTime>=source.duration-.035)end();
    };
    // rAF paints at a stable 24fps (30 on high). It can repeat the last
    // decoded frame when the decoder is temporarily slow, instead of leaving
    // avoidable capture gaps while waiting for requestVideoFrameCallback.
    const animate=(now:number)=>{draw(now);if(!stopped)raf=requestAnimationFrame(animate);};
    active.start(900);
    await source.play();
    raf=requestAnimationFrame(animate);
    // Encoding with canvas, logo, WebAudio and MP4 muxing may make playback
    // slower than real time on phones. Never treat duration+14s as EOF:
    // that prematurely stopped valid jobs at e.g. 76%.
    const startAt=performance.now();
    let lastAdvanceAt=startAt,lastSourceTime=source.currentTime;
    let recoveryAttempts=0,lastRecoveryAt=0,recoveryError="";
    const maxElapsedMs=Math.max(8*60_000,source.duration*12_000);
    watchdog=setInterval(()=>{
      if(stopped)return;
      const now=performance.now();
      if(source.currentTime>lastSourceTime+.035){
        lastSourceTime=source.currentTime;
        lastAdvanceAt=now;
        recoveryAttempts=0;
      }
      if(source.ended||source.currentTime>=source.duration-.035){end();return;}
      if(now-startAt>maxElapsedMs){
        prematureStopReason="A geração ultrapassou o limite de segurança sem chegar ao final do vídeo. Tente novamente com a aba aberta.";
        end();return;
      }
      const idleMs=now-lastAdvanceAt;
      if(idleMs>12_000&&recoveryAttempts<2&&now-lastRecoveryAt>12_000){
        recoveryAttempts++;
        lastRecoveryAt=now;
        progress({
          percent:Math.min(99,Math.floor(source.currentTime/source.duration*100)),
          stage:"Reprodução lenta: tentando retomar o vídeo para concluir o MP4...",
        });
        // Resume playback without recreating the MediaElementAudioSourceNode.
        if(source.paused||(idleMs>24_000&&source.readyState>=2)){
          if(!source.paused)source.pause();
          void source.play().catch(err=>{
            recoveryError=err instanceof Error?err.message:String(err);
          });
        }
      }
      if(idleMs>75_000){
        const pct=Math.floor(source.currentTime/source.duration*100);
        prematureStopReason=`A geração parou em ${pct}% porque o navegador ficou sem avançar por mais de 75 segundos.`+
          (recoveryError?` Erro de reprodução: ${recoveryError}`:"")+
          " Mantenha a aba aberta e tente novamente.";
        end();
      }
    },1000);
    const blob=await finished;
    if(signal?.aborted)throw new Error("Exportação cancelada por segurança.");
    if(prematureStopReason)throw new Error(prematureStopReason);
    if(source.currentTime<source.duration-.4){
      const pct=Math.floor(source.currentTime/source.duration*100);
      throw new Error(`O gravador terminou antes do vídeo: ${pct}% processado. Tente novamente com a aba aberta.`);
    }
    if(frames<source.duration*6)
      throw new Error("O navegador não processou quadros suficientes para gerar o vídeo inteiro. Tente novamente com a aba aberta.");
    progress({percent:99,stage:"Finalizando MP4 para WhatsApp..."});
    const output=await finalizeCinematicMp4(blob);
    progress({percent:100,stage:"MP4 pronto"});
    return output;
  }finally{
    if(onAbort&&signal)signal.removeEventListener("abort",onAbort);
    if(raf)cancelAnimationFrame(raf);
    if(watchdog)clearInterval(watchdog);
    if(onEnded)source.removeEventListener("ended",onEnded);
    source.pause();
    try{if(recorder?.state!=="inactive")recorder?.stop();}catch{/*already closed*/}
    disconnectAudio?.();
    stream.getTracks().forEach(track=>track.stop());
    canvas.width=canvas.height=0;
    overlay.width=overlay.height=0;
  }
}
