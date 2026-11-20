import {useEffect,useRef,useSyncExternalStore} from "react";
import {Link} from "@tanstack/react-router";
import {Download,LoaderCircle,CheckCircle2,AlertTriangle,Video,X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
  subscribeToVideoJob,getVideoJobSnapshot,isVideoJobRunning,downloadVideoJob,
  attachVideoJobPreviewHost,dismissVideoJob,
} from "@/lib/vitrine-video-background-job";

/**
 * Always mounted above the authenticated routing tree. The source video also
 * lives outside routed components, so changing Stream Monitor pages does not
 * unmount an active render.
 *
 * iOS may suspend the *entire browser* when the user switches apps; this is
 * deliberately not advertised as a server-side/background-phone export.
 */
export function VideoExportDock(){
  const job=useSyncExternalStore(
    subscribeToVideoJob,getVideoJobSnapshot,getVideoJobSnapshot
  );
  const running=job.status==="preparing"||job.status==="rendering";
  const previewHost=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!running)return;
    attachVideoJobPreviewHost(previewHost.current);
    return()=>attachVideoJobPreviewHost(null);
  },[running]);
  useEffect(()=>{
    if(!running)return;
    const warn=(event:BeforeUnloadEvent)=>{
      if(!isVideoJobRunning())return;
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[running]);
  if(job.status==="idle")return null;
  return <aside aria-live="polite"
    className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-[90] w-[min(360px,calc(100vw-24px))] rounded-2xl border border-blue-500/45 bg-[#06182c]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
    <div className="flex items-start gap-2">
      {running?<LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-300"/>:
        job.status==="ready"?<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300"/>:
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"/>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {running?"Preparando seu vídeo":job.status==="ready"?"Seu vídeo ficou pronto":"Geração interrompida"}
        </p>
        <p className="truncate text-xs text-slate-300">{job.title}</p>
      </div>
      <span className="text-xs font-bold text-blue-200">{job.percent}%</span>
      {!running&&<button type="button" aria-label="Fechar aviso do vídeo"
        title="Fechar este aviso" onClick={()=>dismissVideoJob()}
        className="ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
        <X aria-hidden="true" className="h-5 w-5"/>
      </button>}
    </div>
    {running&&<div ref={previewHost}
      className="mt-3 h-[118px] overflow-hidden rounded-lg border border-white/15 bg-black"
      aria-label="Vídeo sendo processado"/>}
    {running&&<div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
      <div className="h-full bg-blue-400 transition-[width] duration-300"
        style={{width:job.percent+"%"}}/>
    </div>}
    <p className={"mt-2 text-xs "+(job.status==="error"?"text-amber-200":"text-slate-300")}>
      {job.status==="error"?job.error:job.stage}
    </p>
    {running&&<p className="mt-1 text-[11px] leading-snug text-slate-400">
      Pode navegar pelas páginas do Stream Monitor. No iPhone, mantenha o
      Safari aberto para não interromper a gravação.
    </p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {job.status==="ready"&&<Button size="sm" className="bg-blue-500 text-white hover:bg-blue-600"
        onClick={()=>void downloadVideoJob()}>
        <Download className="mr-1.5 h-4 w-4"/> Baixar MP4
      </Button>}
      <Button asChild size="sm" variant="outline"
        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
        <Link to="/vitrine-video-modelos"><Video className="mr-1.5 h-4 w-4"/> Vitrine Vídeos</Link>
      </Button>
    </div>
  </aside>;
}
