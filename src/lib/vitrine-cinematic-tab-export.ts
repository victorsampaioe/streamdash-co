import {renderCinematic,type CinematicOptions} from "./vitrine-cinematic-canvas";
import {supportedMp4Mime,type ExportProgress} from "./vitrine-cinematic-mp4";

/**
 * User-initiated, local-only tab video composition.
 *
 * Browser capture permission is ALWAYS requested by getDisplayMedia().
 * The browser decides which tab can be shared; no permission bypasses,
 * cross-origin iframe reads, DRM circumvention, server uploads or YouTube
 * downloading. Use ONLY with media that may legally be captured/reused.
 *
 * The current site's embedded preview may be cropped to the visible iframe,
 * so the canvas records the video area rather than the surrounding app UI.
 */
export function canGenerateTabMp4(withAudio:boolean){
  return typeof window!=="undefined"&&
    window.isSecureContext&&
    !!navigator.mediaDevices?.getDisplayMedia&&
    typeof HTMLCanvasElement.prototype.captureStream==="function"&&
    !!supportedMp4Mime(withAudio);
}

type Crop={sx:number;sy:number;sw:number;sh:number};
function getCropForIframe(
  video:HTMLVideoElement,
  currentTabFrame:HTMLIFrameElement|null,
):Crop|null{
  if(!currentTabFrame||!video.videoWidth||!video.videoHeight)return null;
  const rect=currentTabFrame.getBoundingClientRect();
  if(rect.width<70||rect.height<40||rect.bottom<0||rect.right<0||
    rect.left>innerWidth||rect.top>innerHeight)return null;

  const scaleX=video.videoWidth/window.innerWidth;
  const scaleY=video.videoHeight/window.innerHeight;
  const sx=Math.max(0,rect.left*scaleX),sy=Math.max(0,rect.top*scaleY);
  const sw=Math.min(video.videoWidth-sx,rect.width*scaleX);
  const sh=Math.min(video.videoHeight-sy,rect.height*scaleY);
  return sw>20&&sh>20?{sx,sy,sw,sh}:null;
}
export async function renderAuthorizedTabMp4(
  canvas:HTMLCanvasElement,
  artwork:Omit<CinematicOptions,"video">,
  seconds:15|30|60,
  includeAudio:boolean,
  frameElement:HTMLIFrameElement|null,
  progress:(value:ExportProgress)=>void,
):Promise<Blob>{
  // This call must happen on the direct user click path, before any awaits.
  // Never request desktop/window capture: only tab (browser surface) may pass.
  if(!canGenerateTabMp4(includeAudio))
    throw new Error("Este navegador não permite gerar MP4 H.264/AAC a partir de uma aba compartilhada.");
  const capture=navigator.mediaDevices.getDisplayMedia({
    video:{displaySurface:"browser",frameRate:30},
    audio:includeAudio,
    // Chrome may offer 'This Tab'; browsers are free to ignore this hint.
    preferCurrentTab:true,
    surfaceSwitching:"exclude",
    selfBrowserSurface:"include",
  } as DisplayMediaStreamOptions);

  const shared=await capture;
  let composite:MediaStream|null=null;
  let source:HTMLVideoElement|null=null;
  let recorder:MediaRecorder|null=null;
  let raf=0;
  let watchId:ReturnType<typeof setTimeout>|null=null;
  let stopped=false;
  let manuallyStopped=false;
  const release=()=>{
    if(raf)cancelAnimationFrame(raf);
    if(watchId)clearTimeout(watchId);
    if(recorder&&recorder.state==="recording"){
      try{recorder.stop();}catch{/* already stopped */}
    }
    composite?.getTracks().forEach(t=>t.stop());
    shared.getTracks().forEach(t=>t.stop());
    if(source){source.pause();source.srcObject=null;source.remove();}
  };

  try{
    const videoTrack=shared.getVideoTracks()[0];
    const surface=videoTrack?.getSettings().displaySurface;
    // Some browsers do not populate displaySurface. We cannot verify that
    // the user chose a tab in that case, and MUST NOT record a full desktop.
    if(surface!=="browser")
      throw new Error("Escolha apenas uma aba do navegador. A captura da tela inteira ou de aplicativos não é permitida.");
    if(includeAudio&&shared.getAudioTracks().length===0)
      throw new Error("A aba selecionada não compartilhou áudio. Ative 'Compartilhar áudio da aba' ou desative o áudio na arte.");

    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)throw new Error("Não foi possível iniciar a arte cinematográfica.");
    source=document.createElement("video");
    source.muted=true;
    source.playsInline=true;
    source.autoplay=true;
    source.srcObject=shared;

    await new Promise<void>((resolve,reject)=>{
      if(!source)return reject(new Error("Fonte de vídeo não disponível."));
      const timer=setTimeout(()=>reject(new Error("A aba não forneceu quadros de vídeo.")),8000);
      source.addEventListener("loadedmetadata",()=>{clearTimeout(timer);resolve();},{once:true});
      source.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("Erro ao acessar os quadros da aba."));},{once:true});
    });
    await source.play();
    const mime=supportedMp4Mime(includeAudio);
    if(!mime)throw new Error("MP4 não suportado neste navegador.");

    renderCinematic(ctx,{...artwork,video:source,videoCrop:frameElement?getCropForIframe(source,frameElement):null});
    composite=canvas.captureStream(30);
    if(includeAudio){
      for(const track of shared.getAudioTracks())composite.addTrack(track);
    }

    const chunks:BlobPart[]=[];
    recorder=new MediaRecorder(composite,{
      mimeType:mime,
      videoBitsPerSecond:8_000_000,
      ...(includeAudio?{audioBitsPerSecond:128_000}:{}),
    });
    const mediaRecorder=recorder;
    const finished=new Promise<Blob>((resolve,reject)=>{
      mediaRecorder.addEventListener("dataavailable",e=>{if(e.data.size)chunks.push(e.data);});
      mediaRecorder.addEventListener("error",()=>reject(new Error("Falha ao gerar o vídeo MP4.")));
      mediaRecorder.addEventListener("stop",async()=>{
        try{
          const result=new Blob(chunks,{type:mediaRecorder.mimeType});
          const magic=new Uint8Array(await result.slice(0,12).arrayBuffer());
          if(result.size<50_000||String.fromCharCode(...magic.slice(4,8))!=="ftyp")
            throw new Error("A gravação não produziu um MP4 válido.");
          resolve(result);
        }catch(e){reject(e);}
      });
    });

    const started=performance.now();
    const end=()=>{
      if(stopped)return;
      stopped=true;
      if(mediaRecorder.state!=="inactive")mediaRecorder.stop();
    };
    videoTrack.addEventListener("ended",()=>{
      manuallyStopped=true;
      end();
    },{once:true});
    const tick=(now:number)=>{
      if(stopped)return;
      const elapsed=(now-started)/1000;
      // Screen permission captures a tab, not the iframe's pixel data. Read
      // only the browser-authorized MediaStream and crop its visible region.
      const crop=frameElement?getCropForIframe(source!,frameElement):null;
      renderCinematic(ctx,{...artwork,video:source,videoCrop:crop});
      progress({
        seconds:Math.min(seconds,elapsed),
        total:seconds,
        percent:Math.min(99,Math.floor(elapsed/seconds*100)),
        stage:"Gerando MP4 cinematográfico...",
      });
      if(elapsed>=seconds){end();return;}
      raf=requestAnimationFrame(tick);
    };

    mediaRecorder.start(500);
    raf=requestAnimationFrame(tick);
    // Watchdog handles background-tab throttling; it must not hang forever.
    watchId=setTimeout(end,(seconds+20)*1000);
    const blob=await finished;
    const elapsed=(performance.now()-started)/1000;
    if(manuallyStopped||elapsed<seconds-1)
      throw new Error("A captura terminou antes do trecho selecionado. Mantenha a aba compartilhada até terminar o processamento.");
    progress({seconds,total:seconds,percent:100,stage:"MP4 pronto"});
    return blob;
  }finally{
    release();
  }
}
