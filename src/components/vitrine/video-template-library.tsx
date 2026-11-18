import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Link} from "@tanstack/react-router";
import {toast} from "sonner";
import {Download,Film,Play,RefreshCw,Upload,Video,CheckCircle2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card} from "@/components/ui/card";
import {listVideoModels,type VideoModel} from "@/lib/vitrine-video-models.functions";
import {getCinematicBannerBrand} from "@/lib/vitrine-cinematic.functions";
import {normalizeCinematicLogoPng} from "@/lib/vitrine-cinematic-logo";
import {videoOverlayGeometry,VIDEO_WHATSAPP_MONO,type VideoOverlayBrand} from "@/lib/vitrine-video-template-render";
import {
  getVideoJobSnapshot,subscribeToVideoJob,prepareVideoJobSource,
  startVideoExportInDocument,downloadVideoJob,restoreCompletedVideo,
} from "@/lib/vitrine-video-background-job";
import {formatCinematicWhatsApp} from "@/lib/vitrine-cinematic-canvas";
import type {ResellerVideoQuality} from "@/lib/vitrine-video-quality";

const area="rounded-2xl border border-blue-400/20 bg-[#071729] p-4 sm:p-6";
function loadLogoImage(src:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const img=new Image();
    if(!src.startsWith("data:")&&!src.startsWith("blob:"))img.crossOrigin="anonymous";
    img.onload=()=>img.naturalWidth?resolve(img):reject(new Error("Logo sem imagem."));
    img.onerror=()=>reject(new Error("Falha ao carregar a logo da revenda."));
    img.src=src;
  });
}
function filename(title:string){
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40)||"video";
}
export function VideoTemplateLibrary(){
  const list=useServerFn(listVideoModels);
  const brandFn=useServerFn(getCinematicBannerBrand);
  const templates=useQuery({
    queryKey:["video-template-catalog"],queryFn:()=>list(),
    staleTime:60_000,refetchOnWindowFocus:true
  });
  const brandQ=useQuery({
    queryKey:["video-template-my-brand"],queryFn:()=>brandFn(),staleTime:60_000
  });
  const models=templates.data?.models||[];
  const [selectedId,setSelectedId]=useState("");
  const model=useMemo(()=>models.find(m=>m.id===selectedId)||models[0]||null,
    [models,selectedId]);
  // Same fixed proportions as the exported MP4, never responsive to the
  // source's opening animation or to the phone's screen size.
  const overlay=useMemo(()=>videoOverlayGeometry(model?.width||512,model?.height||910),
    [model?.width,model?.height]);
  const overlayStyle=(rect:{x:number;y:number;w:number;h:number})=>({
    left:(rect.x/(model?.width||512)*100)+"%",
    top:(rect.y/(model?.height||910)*100)+"%",
    width:(rect.w/(model?.width||512)*100)+"%",
    height:(rect.h/(model?.height||910)*100)+"%"
  });
  const currentBrand=brandQ.data?.brands?.[0];
  const [overrideLogo,setOverrideLogo]=useState("");
  const [overrideWhatsapp,setOverrideWhatsapp]=useState("");
  const [logo,setLogo]=useState<HTMLImageElement|null>(null);
  const [logoError,setLogoError]=useState("");
  const [videoError,setVideoError]=useState("");
  const [audio,setAudio]=useState(true);
  const [quality,setQuality]=useState<ResellerVideoQuality>("auto");
  const originalVideo=useRef<HTMLVideoElement>(null);
  const job=useSyncExternalStore(subscribeToVideoJob,getVideoJobSnapshot,getVideoJobSnapshot);
  const working=job.status==="preparing"||job.status==="rendering";
  const progress={percent:job.percent,stage:job.stage};
  const result=job.status==="ready"&&job.ownerId===currentBrand?.owner_id;
  const phone=overrideWhatsapp||currentBrand?.whatsapp||"";
  const logoSrc=overrideLogo||currentBrand?.logo_url||"";
  const effectiveBrand:VideoOverlayBrand|null=logo&&currentBrand?{
    name:currentBrand.name,whatsapp:phone,color:currentBrand.color,logo
  }:null;
  useEffect(()=>{
    setLogo(null);setLogoError("");
    if(!logoSrc)return;
    let active=true;
    loadLogoImage(logoSrc).then(normalizeCinematicLogoPng).then(image=>{
      if(active)setLogo(image);
    }).catch(err=>{
      if(active)setLogoError(err instanceof Error?err.message:"Logo não carregou");
    });
    return()=>{active=false};
  },[logoSrc]);
  // Preload a separate, persistent video element owned by the document (not
  // this React route). This remains alive when navigating elsewhere in the
  // Stream Monitor app and drives the full MP4 export.
  useEffect(()=>{
    if(model?.id&&model?.video_url)prepareVideoJobSource(model.id,model.video_url);
  },[model?.id,model?.video_url]);
  useEffect(()=>{
    if(currentBrand?.owner_id)void restoreCompletedVideo(currentBrand.owner_id).catch(()=>{});
  },[currentBrand?.owner_id]);
  useEffect(()=>{
    setVideoError("");
  },[model?.id,model?.video_url]);
  useEffect(()=>()=>{
    if(overrideLogo.startsWith("blob:"))URL.revokeObjectURL(overrideLogo);
  },[overrideLogo]);
  function download(){
    if(!downloadVideoJob())toast.error("Ainda não há um MP4 pronto para baixar.");
  }
  function generate(){
    if(!model||!effectiveBrand||working)return;
    if(!phone.trim()){toast.error("Cadastre o WhatsApp da revenda.");return;}
    const video=originalVideo.current;
    if(videoError){toast.error(videoError);return;}
    if(!video||video.readyState<1){
      toast.error("Abra o vídeo e aguarde carregar antes de gerar.");return;
    }
    try{
      startVideoExportInDocument({
        ownerId:currentBrand?.owner_id||"",modelId:model.id,url:model.video_url,
        title:model.title,
        filename:"stream-monitor-"+filename(model.title)+".mp4",
        brand:effectiveBrand,audio,quality,
      });
      toast.success("Geração iniciada! Você pode navegar pelo Stream Monitor e acompanhar o progresso.");
    }catch(err){
      toast.error(err instanceof Error?err.message:"Não foi possível iniciar o MP4.");
    }
  }
  return <main className="mx-auto max-w-6xl space-y-6 p-4 text-white sm:p-7">
    <header className={area}>
      <p className="text-xs font-bold uppercase tracking-widest text-blue-300">Stream Monitor · Vitrine Vídeos</p>
      <h1 className="mt-2 text-3xl font-black">Vídeos prontos com a marca da sua revenda</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-300">
        Escolha um vídeo cadastrado pelo administrador. Sua logo e seu WhatsApp aparecem
        durante a reprodução e no arquivo MP4 final. A geração continua enquanto você
        navega pelas páginas do Stream Monitor. No iPhone, mantenha o Safari aberto:
        ao fechar o aplicativo, o iOS pode suspender a gravação.
      </p>
    </header>
    {templates.isPending||brandQ.isPending?<Card className="p-7 text-center">
      Carregando vídeos e sua identidade visual...
    </Card>:templates.isError||brandQ.isError?<Card className="p-7 text-center text-red-400">
      Não foi possível abrir a biblioteca. Verifique sua assinatura e a conexão.
      <Button variant="outline" onClick={()=>{void templates.refetch();void brandQ.refetch();}}
        className="mt-4">Tentar novamente</Button>
    </Card>:models.length===0?<div className={area}>
      <p className="text-lg font-bold">Biblioteca de vídeos aguardando modelos</p>
      <p className="mt-2 text-sm text-slate-300">
        O administrador ainda não publicou vídeos MP4 nesta categoria.
      </p>
    </div>:<>
      <section className={area}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-lg">Escolha o vídeo</h2>
          <Button variant="outline" size="sm" onClick={()=>void templates.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4"/> Atualizar
          </Button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.filter(m=>m.active).map(item=><button key={item.id} type="button"
            onClick={()=>setSelectedId(item.id)}
            aria-pressed={model?.id===item.id}
            className={"rounded-xl border p-4 text-left transition-colors "+
              (model?.id===item.id?"border-blue-400 bg-blue-500/20":"border-slate-700 bg-slate-900/60 hover:border-blue-400/50")}>
            <div className="flex gap-2 items-center text-sm font-bold"><Film className="h-4 w-4 text-blue-400"/>{item.title}</div>
            <p className="mt-2 text-xs text-slate-400">{item.description||"Vídeo personalizado"}</p>
            <p className="mt-2 text-xs text-blue-300">{item.duration_seconds}s · {item.width}×{item.height}</p>
          </button>)}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className={area}>
          <h2 className="mb-4 text-lg font-bold">Prévia do modelo</h2>
          <div className="mx-auto max-w-[370px] overflow-hidden rounded-2xl border border-blue-500/30 bg-black">
            <div className="relative" style={{aspectRatio:(model?.width||512)+" / "+(model?.height||910)}}>
              <video key={(model?.id||"")+":"+(model?.video_url||"")}
                ref={originalVideo} src={model?.video_url}
                controls playsInline preload="auto" crossOrigin="anonymous"
                onLoadedData={()=>setVideoError("")}
                onLoadedMetadata={(event)=>{
                  // iOS Safari may display a black paused video unless its first
                  // frame has been decoded. Seek slightly into the clip.
                  const v=event.currentTarget;
                  if(v.duration>.3&&v.currentTime<.01){
                    try{v.currentTime=.15;}catch{/* browser may disallow preseek */}
                  }
                }}
                onError={()=>setVideoError("Não foi possível carregar este vídeo. Atualize a biblioteca ou tente outra conexão.")}
                className="absolute inset-0 h-full w-full object-contain bg-black"/>
              <div className="pointer-events-none absolute flex items-center justify-center"
                style={overlayStyle(overlay.logo)}>
                {logo&&<img alt="Logo da revenda sem fundo" src={logo.src}
                  className="h-full w-full object-contain drop-shadow-md"/>}
              </div>
              <div className="pointer-events-none absolute flex items-center gap-1.5 overflow-hidden rounded-lg border px-2 shadow-sm"
                style={{...overlayStyle(overlay.whatsapp),
                  backgroundColor:VIDEO_WHATSAPP_MONO.background,
                  borderColor:VIDEO_WHATSAPP_MONO.border}}>
                <span className="flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-md text-xs"
                  style={{backgroundColor:VIDEO_WHATSAPP_MONO.iconBackground,
                    color:VIDEO_WHATSAPP_MONO.iconText}}>☎</span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[7px] font-bold"
                    style={{color:VIDEO_WHATSAPP_MONO.caption}}>FALE PELO WHATSAPP</p>
                  <p className="truncate text-[12px] font-bold"
                    style={{color:VIDEO_WHATSAPP_MONO.phone}}>{formatCinematicWhatsApp(phone)||phone||"Configure seu telefone"}</p>
                </div>
              </div>
              {videoError&&<div className="absolute inset-x-3 top-1/3 rounded-lg border border-amber-500/60 bg-black/90 p-3 text-center text-xs text-amber-200">
                {videoError}
                <Button type="button" size="sm" variant="outline" className="mt-2 w-full"
                  onClick={()=>void templates.refetch()}>Atualizar link do vídeo</Button>
              </div>}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Reprodução com a sua marca. A exportação grava a logo e o contato em todos os quadros.
          </p>
          {!logo&&!logoError&&<p className="mt-2 text-xs text-amber-300">
            Não encontrei uma logo da revenda nesta conta. Cadastre nas configurações
            ou envie um PNG abaixo para que apareça na prévia e no MP4.
          </p>}
        </section>
        <section className={area}>
          <h2 className="text-lg font-bold">Sua marca no vídeo</h2>
          <p className="mt-2 text-sm text-slate-300">
            A logo e o WhatsApp vêm automaticamente das configurações da sua revenda.
          </p>
          <div className="mt-4 space-y-3">
            <div><p className="mb-1 text-xs text-slate-400">Marca</p>
              <p className="font-semibold">{currentBrand?.name||"Minha revenda"}</p>
            </div>
            <label className="block text-sm">WhatsApp que aparece no vídeo
              <Input value={phone} onChange={e=>setOverrideWhatsapp(e.target.value)}
                className="mt-1 bg-slate-950 text-white" placeholder="(85) 99854-5009"/>
            </label>
            <label className="block text-sm">Logo PNG personalizada (opcional)
              <Input type="file" accept="image/png,image/webp,image/jpeg" className="mt-1 bg-slate-950 text-white"
                onChange={e=>{
                  const f=e.target.files?.[0];
                  if(!f)return;
                  if(!f.type.startsWith("image/")||f.size>5*1024*1024){
                    toast.error("Escolha uma logo JPG ou PNG de até 5 MB.");return;
                  }
                  setOverrideLogo(URL.createObjectURL(f));
                }}/>
            </label>
            {!logoSrc&&<p className="text-amber-400 text-sm">
              Cadastre uma logo nas configurações da sua revenda ou envie um PNG acima.
            </p>}
            {logoError&&<p className="text-sm text-amber-400">{logoError}</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={audio} onChange={e=>setAudio(e.target.checked)}/>
              Manter o áudio original do vídeo
            </label>
            <label className="block text-sm">Qualidade do MP4 (para evitar travadas)
              <select value={quality} disabled={working}
                onChange={e=>setQuality(e.target.value as ResellerVideoQuality)}
                className="mt-2 min-h-11 w-full rounded-xl border border-blue-400/30 bg-slate-950 px-3 py-2 text-sm text-white">
                <option value="auto">Automática — alta qualidade nos aparelhos potentes (recomendada)</option>
                <option value="compatible">Compatível — celulares antigos (480p / 24 fps)</option>
                <option value="high">Alta definição — máxima nitidez (até 1080p / 30 fps)</option>
              </select>
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                Automática identifica a capacidade do aparelho: até 1080p/30 fps nos mais potentes,
                720p nos intermediários e 480p nos antigos. O arquivo mantém a resolução escolhida
                ao ser compartilhado; se preferir, selecione a qualidade manualmente.
                A narração, a logo e o WhatsApp são preservados.
              </span>
            </label>
          </div>
          <Button className="mt-5 w-full" disabled={working||!logo||!model||!phone.trim()}
            onClick={()=>void generate()}>
            {working?<RefreshCw className="mr-2 h-4 w-4 animate-spin"/>:<Play className="mr-2 h-4 w-4"/>}
            {working?"Gerando MP4 (pode navegar)...":"Gerar vídeo com minha logo e WhatsApp"}
          </Button>
          {working&&<p className="mt-2 text-xs text-blue-300">
            A geração agora funciona fora desta tela e continua durante a navegação.
            O progresso fica disponível no rodapé do Stream Monitor.
          </p>}
          {working&&<div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-blue-500 transition-all" style={{width:progress.percent+"%"}}/>
            </div>
            <p className="mt-2 text-xs text-slate-300">{progress.percent}% · {progress.stage}</p>
          </div>}
          {result&&<div className="mt-4 rounded-xl border border-green-500/30 bg-green-950/30 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-300">
              <CheckCircle2 className="h-4 w-4"/> MP4 personalizado pronto
            </p>
            <Button className="w-full" onClick={download}>
              <Download className="mr-2 h-4 w-4"/> Baixar MP4 personalizado
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              Pronto para compartilhar nos seus canais. O arquivo contém o vídeo, sua logo e WhatsApp.
            </p>
          </div>}
        </section>
      </div>
    </>}
  </main>;
}
