import {formatCinematicWhatsApp} from "./vitrine-cinematic-canvas";
import {supportedMp4Mime} from "./vitrine-cinematic-mp4";
import {finalizeCinematicMp4} from "./vitrine-cinematic-whatsapp";

export type VideoOverlayBrand={
  name:string;whatsapp:string;color:string;logo:HTMLImageElement
};
export type VideoExportProgress={percent:number;stage:string};
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const corner=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.roundRect(x,y,w,h,corner);ctx.closePath();
}
export function videoOverlayGeometry(width:number,height:number){
  const unit=Math.max(.1,Math.min(width/512,height/910));
  return {
    scale:unit,logo:{x:18*unit,y:32*unit,w:184*unit,h:90*unit},
    whatsapp:{x:20*unit,y:795*unit,w:472*unit,h:70*unit},
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
  ctx.save();ctx.shadowColor="rgba(0,0,0,.45)";
  ctx.shadowBlur=14*unit;ctx.fillStyle="rgba(2,8,27,.77)";
  rounded(ctx,logo.x-6*unit,logo.y-5*unit,logo.w+12*unit,logo.h+10*unit,16*unit);
  ctx.fill();ctx.restore();
  if(brand.logo?.naturalWidth>0){
    const scale=Math.min(logo.w/brand.logo.naturalWidth,logo.h/brand.logo.naturalHeight);
    const lw=brand.logo.naturalWidth*scale,lh=brand.logo.naturalHeight*scale;
    ctx.drawImage(brand.logo,logo.x+(logo.w-lw)/2,logo.y+(logo.h-lh)/2,lw,lh);
  }
  // Footer is below the sample's original supported-device graphics.
  const phone=layout.whatsapp;
  ctx.save();ctx.shadowColor="rgba(0,0,0,.62)";ctx.shadowBlur=12*unit;
  ctx.fillStyle="rgba(1,21,22,.91)";
  rounded(ctx,phone.x,phone.y,phone.w,phone.h,16*unit);ctx.fill();
  ctx.strokeStyle="#38d692";ctx.lineWidth=2*unit;ctx.stroke();ctx.restore();
  ctx.save();ctx.fillStyle="#12bd7b";
  rounded(ctx,phone.x+12*unit,phone.y+13*unit,46*unit,44*unit,12*unit);ctx.fill();
  ctx.fillStyle="#ffffff";ctx.font="bold "+(27*unit)+"px Arial,sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText("☎",phone.x+35*unit,phone.y+35*unit);
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
  ctx.fillStyle="#8ce7bc";ctx.font="bold "+(12*unit)+"px Arial,sans-serif";
  ctx.fillText("FALE PELO WHATSAPP",phone.x+70*unit,phone.y+27*unit);
  const label=formatCinematicWhatsApp(brand.whatsapp)||brand.whatsapp;
  ctx.font="bold "+(25*unit)+"px Arial,sans-serif";
  if(ctx.measureText(label).width>(phone.w-91*unit))
    ctx.font="bold "+(20*unit)+"px Arial,sans-serif";
  ctx.fillStyle="#ffffff";ctx.fillText(label,phone.x+70*unit,phone.y+55*unit);
  ctx.restore();
}
export async function renderResellerVideoMp4(opts:{
  source:HTMLVideoElement;brand:VideoOverlayBrand;audio:boolean;
  progress:(progress:VideoExportProgress)=>void;
}):Promise<Blob>{
  const {source,brand,audio,progress}=opts;
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
    if(source.currentTime<source.duration-.4 || frames<source.duration*6)
      throw new Error("A exportação foi interrompida. O vídeo original permanece intacto.");
    progress({percent:99,stage:"Finalizando MP4 para WhatsApp..."});
    const output=await finalizeCinematicMp4(blob);
    progress({percent:100,stage:"MP4 pronto"});
    return output;
  }finally{
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
