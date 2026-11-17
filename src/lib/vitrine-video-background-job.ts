import {renderResellerVideoMp4,type VideoExportProgress,type VideoOverlayBrand} from "./vitrine-video-template-render";

export type VideoJobStatus="idle"|"preparing"|"rendering"|"ready"|"error";
export type VideoJobSnapshot={
  status:VideoJobStatus;
  ownerId:string;
  title:string;
  filename:string;
  percent:number;
  stage:string;
  error:string;
  finishedAt:number|null;
};
const idle:VideoJobSnapshot={
  status:"idle",ownerId:"",title:"",filename:"",percent:0,stage:"",error:"",finishedAt:null,
};
let snapshot:VideoJobSnapshot=idle;
let finishedFile:Blob|null=null;
let media:{url:string;modelId:string;video:HTMLVideoElement}|null=null;
let running=false;
let jobEpoch=0;
let activeAbort:AbortController|null=null;
const subscribers=new Set<()=>void>();
export const getVideoJobSnapshot=()=>snapshot;
export function subscribeToVideoJob(onChange:()=>void){
  subscribers.add(onChange);
  return ()=>{subscribers.delete(onChange);};
}
function updateJob(changes:Partial<VideoJobSnapshot>){
  snapshot={...snapshot,...changes};
  subscribers.forEach(cb=>cb());
}
export function isVideoJobRunning(){
  return running||snapshot.status==="preparing"||snapshot.status==="rendering";
}
/** Keep this video source in the *document*, never in the route component.
 * TanStack Router can unmount the Vitrine page while encoding, but its
 * root/document and this video element survive same-site SPA navigation.
 */
export function prepareVideoJobSource(modelId:string,url:string){
  if(typeof document==="undefined"||!url||!modelId)return;
  if(media?.modelId===modelId&&media.url===url)return;
  if(running)return; // Never replace the video currently being encoded.
  if(media)releaseSource();
  const video=document.createElement("video");
  video.preload="auto";
  video.playsInline=true;
  video.crossOrigin="anonymous";
  video.controls=false;
  video.setAttribute("webkit-playsinline","");
  video.setAttribute("aria-hidden","true");
  video.style.cssText="position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.001;pointer-events:none;z-index:-1;";
  video.src=url;
  document.body.appendChild(video);
  video.load();
  media={modelId,url,video};
}
/** Keep the playing source genuinely visible inside the persistent status
 * dock. Safari may throttle or refuse decoding a fully hidden video element,
 * even while the user remains in the same browser tab.
 */
export function attachVideoJobPreviewHost(host:HTMLElement|null){
  if(!media||typeof document==="undefined")return;
  if(host&&running){
    host.appendChild(media.video);
    media.video.style.cssText="width:100%;height:100%;object-fit:contain;background:#000;border-radius:10px;pointer-events:none;";
  }else{
    document.body.appendChild(media.video);
    media.video.style.cssText="position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.001;pointer-events:none;z-index:-1;";
  }
}
function releaseSource(){
  if(!media)return;
  media.video.pause();
  media.video.removeAttribute("src");
  media.video.load();
  media.video.remove();
  media=null;
}
export function dismissVideoJob(){
  if(running)return;
  finishedFile=null;
  updateJob(idle);
  releaseSource();
}
type StartArgs={
  ownerId:string;modelId:string;url:string;title:string;filename:string;
  brand:VideoOverlayBrand;audio:boolean;
};
export function startVideoExportInDocument(args:StartArgs){
  if(running)throw new Error("Já existe um MP4 sendo preparado. Aguarde a conclusão.");
  if(!args.ownerId||!args.modelId||!args.url)throw new Error("Selecione um vídeo válido.");
  if(!args.brand.logo?.naturalWidth)throw new Error("Cadastre a logo da revenda.");
  if(!media||media.modelId!==args.modelId||media.url!==args.url)
    prepareVideoJobSource(args.modelId,args.url);
  const video=media?.video;
  if(!video||video.readyState<1||video.error)
    throw new Error("O vídeo ainda não está pronto. Aguarde o carregamento e tente novamente.");
  finishedFile=null;
  running=true;
  const epoch=++jobEpoch;
  activeAbort=new AbortController();
  const signal=activeAbort.signal;
  updateJob({
    status:"preparing",ownerId:args.ownerId,title:args.title,filename:args.filename,
    percent:0,stage:"Preparando vídeo em segundo plano na navegação...",error:"",finishedAt:null,
  });
  // Do not await this promise in a route component: the job must continue
  // even if its React component unmounts during navigation.
  void (async()=>{
    try{
      const blob=await renderResellerVideoMp4({
        source:video,brand:args.brand,audio:args.audio,signal,
        progress:(progress:VideoExportProgress)=>{
          if(epoch===jobEpoch)updateJob({
            status:"rendering",percent:progress.percent,stage:progress.stage
          });
        }
      });
      if(epoch!==jobEpoch)return;
      if(blob.type!=="video/mp4"||blob.size<4096)
        throw new Error("O navegador não concluiu o arquivo MP4.");
      finishedFile=blob;
      updateJob({status:"ready",percent:100,stage:"MP4 pronto para baixar",
        finishedAt:Date.now()});
      try{await saveCompletedVideo(args.ownerId,args.filename,blob);}catch{
        // IndexedDB is optional (private browsing / quota). The completed MP4
        // remains downloadable until this tab is closed.
      }
    }catch(e){
      if(epoch===jobEpoch)
        updateJob({status:"error",error:e instanceof Error?e.message:"Falha ao gerar vídeo.",
          stage:"Não foi possível concluir o MP4"});
    }finally{
      if(epoch===jobEpoch){
        running=false;activeAbort=null;
        // A finished video should not keep its source/track alive.
        releaseSource();
      }
    }
  })();
}
export function downloadVideoJob(){
  if(snapshot.status!=="ready"||!finishedFile)return false;
  const url=URL.createObjectURL(finishedFile);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=snapshot.filename||"stream-monitor-video.mp4";
  document.body.appendChild(anchor);
  anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
  return true;
}

const DB_NAME="streammonitor-custom-videos";
const STORE_NAME="completed";
type SavedVideo={ownerId:string;filename:string;title:string;blob:Blob;savedAt:number};
function openCompletedDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME,{keyPath:"ownerId"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function saveCompletedVideo(ownerId:string,filename:string,blob:Blob){
  if(typeof indexedDB==="undefined")return;
  const db=await openCompletedDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).put({
      ownerId,filename,title:snapshot.title,blob,savedAt:Date.now()
    } satisfies SavedVideo);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  db.close();
}
export async function restoreCompletedVideo(ownerId:string){
  if(!ownerId||running||typeof indexedDB==="undefined")return false;
  const db=await openCompletedDb();
  const entry=await new Promise<SavedVideo|undefined>((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readonly");
    const req=tx.objectStore(STORE_NAME).get(ownerId);
    req.onsuccess=()=>resolve(req.result as SavedVideo|undefined);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  if(!entry||!entry.blob||entry.blob.type!=="video/mp4")return false;
  // Do not overwrite a more recent successful render in the same tab.
  if(snapshot.status==="ready"&&snapshot.finishedAt&&snapshot.finishedAt>=entry.savedAt)return false;
  if(snapshot.status==="rendering"||snapshot.status==="preparing")return false;
  finishedFile=entry.blob;
  updateJob({status:"ready",ownerId,title:entry.title,filename:entry.filename,
    percent:100,stage:"Vídeo salvo no dispositivo",error:"",finishedAt:entry.savedAt});
  return true;
}
export function clearVideoJobOnSignOut(){
  // Sign-out must also stop an *active* render, so another user opening this
  // browser cannot see its logo, contact, progress or completed video.
  ++jobEpoch;
  activeAbort?.abort();
  activeAbort=null;
  running=false;
  finishedFile=null;
  releaseSource();
  updateJob(idle);
}
