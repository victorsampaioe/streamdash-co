import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useRouteContext} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {toast} from "sonner";
import {
  Film,Clapperboard,Search,Download,Upload,RefreshCw,Play,Pause,
  ImageIcon,ShieldCheck,Clock3,AlertTriangle,CheckCircle2,Palette,Music2,Share2
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {getVitrineTmdbFeed} from "@/lib/vitrine-catalog.functions";
import {getCinematicTmdbDetail,getCinematicBrands,getCinematicBannerDetail,getCinematicBannerBrand,getCinematicRenderControls,saveCinematicRenderControls,recordCinematicRender,type CinematicBrand} from "@/lib/vitrine-cinematic.functions";
import {
  renderCinematic,formatCinematicWhatsApp,cinematicVideoFrameRect,cinematicFormats,type CinematicOptions,
  type CinematicFormat,type CinematicMode
} from "@/lib/vitrine-cinematic-canvas";
import {renderNativeMp4,supportedMp4Mime,renderDimensions,WHATSAPP_VIDEO_MAX_BYTES,type Mp4Preset} from "@/lib/vitrine-cinematic-mp4";
import {normalizeCinematicLogoPng} from "@/lib/vitrine-cinematic-logo";
import {finalizeCinematicMp4} from "@/lib/vitrine-cinematic-whatsapp";

type SearchItem={
  tmdb_id:number;media_type:"movie"|"tv";title:string;
  poster_path:string|null;release_date:string|null;overview?:string|null;
};
type StudioAssets={
  background:HTMLImageElement|null;poster:HTMLImageElement|null;
  logo:HTMLImageElement|null;error:string;warning:string;
};
const brandFallback:CinematicBrand={
  owner_id:"",name:"Minha Revenda",logo_url:"",whatsapp:"",color:"#2563eb",
};
const defaultLogo="/__l5e/assets-v1/6c2c6658-faca-42c7-9e11-89b20a23a3dd/logo-official.png";
const labels=["NOVIDADE","NOVO FILME","NOVA SÉRIE","EM ALTA"] as const;
function tmdbPath(path:string|null|undefined,size:"original"|"w500"="original"){
  if(!path||!/^\/[a-z0-9/_.-]+$/i.test(path))return "";
  return "https://image.tmdb.org/t/p/"+size+path;
}
function loadImage(url:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    if(!url.startsWith("data:image/")&&!url.startsWith("/")&&!/^https:\/\//.test(url)){
      reject(new Error("Endereço de imagem não permitido."));return;
    }
    const image=new Image();
    if(!url.startsWith("data:"))image.crossOrigin="anonymous";
    image.onload=()=>image.naturalWidth>0?resolve(image):reject(new Error("Imagem inválida."));
    image.onerror=()=>reject(new Error("A imagem não carregou ou foi bloqueada pelo servidor."));
    image.src=url;
  });
}
function downloadFile(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.rel="noopener";document.body.appendChild(a);
  a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
function slug(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-|-$/g,"").slice(0,50)||"vitrine";
}
const inputClass="h-10 rounded-lg border border-blue-400/20 bg-slate-950/75 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500";
const panelClass="rounded-2xl border border-blue-500/20 bg-[#081628]/90 p-4 sm:p-5";

export function CinematicStudio({mode}:{mode:CinematicMode}){
  const {user}=useRouteContext({from:"/_authenticated"});
  const getFeed=useServerFn(getVitrineTmdbFeed);
  const getDetail=useServerFn(getCinematicTmdbDetail);
  const getBannerDetail=useServerFn(getCinematicBannerDetail);
  const getBrands=useServerFn(getCinematicBrands);
  const getBannerBrand=useServerFn(getCinematicBannerBrand);
  const getControls=useServerFn(getCinematicRenderControls);
  const saveControls=useServerFn(saveCinematicRenderControls);
  const recordRender=useServerFn(recordCinematicRender);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const previewVideoRef=useRef<HTMLVideoElement>(null);
  const busyRef=useRef(false);
  const [media,setMedia]=useState<"movie"|"tv">("movie");
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [format,setFormat]=useState<CinematicFormat>("portrait");
  const [brandId,setBrandId]=useState("");
  const [brandOverrides,setBrandOverrides]=useState<Partial<CinematicBrand>>({});
  const [label,setLabel]=useState<string>("NOVIDADE");
  const [description,setDescription]=useState("");
  const [color,setColor]=useState("#60a5fa");
  const [lighting,setLighting]=useState<"natural"|"blue"|"warm">("blue");
  const [logoPosition,setLogoPosition]=useState<"left"|"right">("left");
  const [posterVisible,setPosterVisible]=useState(true);
  const [backdropChoice,setBackdropChoice]=useState("");
  const [localLogo,setLocalLogo]=useState("");
  const [assets,setAssets]=useState<StudioAssets>({background:null,poster:null,logo:null,error:"",warning:""});
  const [loadingAssets,setLoadingAssets]=useState(false);
  const [videoFile,setVideoFile]=useState<File|null>(null);
  const [videoLinkDraft,setVideoLinkDraft]=useState("");
  const [activeVideoLink,setActiveVideoLink]=useState("");
  const [mp4Preset,setMp4Preset]=useState<Mp4Preset>("whatsapp");
  const [videoUrl,setVideoUrl]=useState("");
  const [videoLength,setVideoLength]=useState(0);
  const [clipSeconds,setClipSeconds]=useState<15|30|60>(15);
  const [clipStart,setClipStart]=useState(0);
  const [youtubeStart,setYoutubeStart]=useState(0);
  const [chosenTrailerKey,setChosenTrailerKey]=useState("");
  const [audio,setAudio]=useState(()=>typeof window!=="undefined"&&!!supportedMp4Mime(true));
  const [rendering,setRendering]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [renderProgress,setRenderProgress]=useState({percent:0,stage:"",seconds:0,total:15});
  const [readyMp4,setReadyMp4]=useState("");
  const [readyMp4Blob,setReadyMp4Blob]=useState<Blob|null>(null);
  const [readyMp4Bytes,setReadyMp4Bytes]=useState(0);
  const [fixingMp4,setFixingMp4]=useState(false);
  const [dailyLimit,setDailyLimit]=useState(5);
  const [brandDailyLimit,setBrandDailyLimit]=useState(5);
  const [maxUploadMb,setMaxUploadMb]=useState(350);
  const [savingControls,setSavingControls]=useState(false);

  useEffect(()=>{
    const t=setTimeout(()=>setQuery(search.trim()),350);
    return()=>clearTimeout(t);
  },[search]);
  const feed=useQuery({
    queryKey:["cinematic-tmdb-search",user.id,media,query],
    queryFn:()=>getFeed({data:{feed:media==="movie"?"movie_recent":"tv_recent",query:query||undefined}}),
    staleTime:120_000,
    retry:1,
  });
  const brands=useQuery({
    queryKey:["cinematic-brand-list",mode,user.id],
    queryFn:()=>mode==="video"?getBrands():getBannerBrand(),
    staleTime:60_000,retry:1,
  });
  const usage=useQuery({
    queryKey:["admin-vitrine-video-audit"],
    queryFn:()=>getControls(),enabled:mode==="video",staleTime:30_000,retry:1,
  });
  const brandList=brands.data?.brands??[];
  const selectedBrand=brandList.find(x=>x.owner_id===brandId)
    ??brandList.find(x=>x.owner_id===brands.data?.currentOwner)
    ??brandFallback;
  const brand={...selectedBrand,...brandOverrides};
  const ownerId=brand.owner_id||user.id;
  useEffect(()=>{
    if(!usage.data)return;
    setDailyLimit(usage.data.policy.defaultDailyLimit);
    setMaxUploadMb(usage.data.policy.maxUploadMb);
  },[usage.data]);
  useEffect(()=>{
    if(!usage.data)return;
    setBrandDailyLimit(usage.data.policy.overrides[ownerId]??usage.data.policy.defaultDailyLimit);
  },[usage.data,ownerId]);
  const detail=useQuery({
    queryKey:["cinematic-tmdb-detail",mode,media,selectedId],
    enabled:selectedId!==null,
    queryFn:()=>mode==="video"
      ?getDetail({data:{media,id:selectedId!}})
      :getBannerDetail({data:{media,id:selectedId!}}),
    staleTime:600_000,retry:1,
  });
  const movie=detail.data?.detail;
  const extra=detail.data?.extras;
  const selectedBackground=backdropChoice||
    extra?.backdrops?.[0]||movie?.backdrop_path||movie?.poster_path||"";
  const selectedPoster=extra?.poster_path||movie?.poster_path||"";
  const logoSource=localLogo||brand.logo_url||(
    mode==="video"&&brand.owner_id===brands.data?.currentOwner?defaultLogo:""
  );

  useEffect(()=>{
    if(movie){
      setDescription(movie.overview||"");
      setLabel(media==="movie"?"NOVO FILME":"NOVA SÉRIE");
      setBackdropChoice("");
      setChosenTrailerKey("");
      setYoutubeStart(0);
      setPosterVisible(true);
    }
  },[movie?.tmdb_id,media]);
  useEffect(()=>{
    if(brand.color&&/^#[\da-f]{6}$/i.test(brand.color)&&!brandOverrides.color)
      setColor(brand.color);
  },[brand.color,brandOverrides.color]);

  useEffect(()=>{
    if(!movie)return;
    let cancelled=false;
    setLoadingAssets(true);
    setAssets({background:null,poster:null,logo:null,error:"",warning:""});
    void (async()=>{
      try{
        const bgUrl=tmdbPath(selectedBackground,"original");
        if(!bgUrl)throw new Error("A TMDB não forneceu backdrop nem pôster oficial.");
        const background=await loadImage(bgUrl);
        const poster=selectedPoster?await loadImage(tmdbPath(selectedPoster,"w500")).catch(()=>null):null;
        const logo=logoSource?await loadImage(logoSource).then(normalizeCinematicLogoPng).catch(()=>null):null;
        if(!cancelled)setAssets({
          background,poster,logo,error:"",
          warning:logoSource&&!logo?"Não foi possível preparar a logo em PNG. Envie um PNG transparente pelo dispositivo.":"",
        });
      }catch(e){
        if(!cancelled)setAssets({
          background:null,poster:null,logo:null,
          error:e instanceof Error?e.message:"Falha ao carregar imagens oficiais.",
          warning:"",
        });
      }finally{if(!cancelled)setLoadingAssets(false);}
    })();
    return()=>{cancelled=true;};
  },[movie?.tmdb_id,selectedBackground,selectedPoster,logoSource]);
  useEffect(()=>{
    if(!videoFile){
      setVideoUrl(activeVideoLink);
      setVideoLength(0);
      return;
    }
    const url=URL.createObjectURL(videoFile);
    setVideoUrl(url);
    setVideoLength(0);
    setClipStart(0);
    setReadyMp4("");
    return()=>URL.revokeObjectURL(url);
  },[videoFile,activeVideoLink]);
  useEffect(()=>{
    setReadyMp4("");
    setReadyMp4Blob(null);
    setReadyMp4Bytes(0);
  },[movie?.tmdb_id,format,clipSeconds,clipStart,audio,mp4Preset,videoUrl,description,color,lighting,label,logoPosition,posterVisible,brand.name,brand.whatsapp,logoSource]);

  const dims=cinematicFormats[format];
  const options=useMemo<Omit<CinematicOptions,"video">>(()=>({
    mode,width:dims.width,height:dims.height,
    title:movie?.title||"Selecione um filme ou série",
    overview:description,year:movie?.release_date?.slice(0,4)||"",
    genre:movie?.genres?.slice(0,2)?.join(" · ")||"",
    classification:extra?.classification||"",
    label,brand:brand.name,whatsapp:brand.whatsapp,color,
    logoPosition,lighting,posterVisible,
    background:assets.background,backgroundIsPoster:!!selectedPoster&&selectedBackground===selectedPoster,
    poster:assets.poster,logo:assets.logo,
  }),[mode,dims.width,dims.height,movie?.title,movie?.release_date,movie?.genres,description,extra?.classification,label,brand.name,brand.whatsapp,color,logoPosition,lighting,posterVisible,assets,selectedPoster,selectedBackground]);
  useEffect(()=>{
    if(!canvasRef.current)return;
    const canvas=canvasRef.current,ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)return;
    canvas.width=dims.width;canvas.height=dims.height;
    let id=0;
    const draw=()=>{
      const video=previewVideoRef.current;
      renderCinematic(ctx,{...options,video:mode==="video"&&video&&video.readyState>=2?video:null});
      if(mode==="video"&&!rendering&&video&&!video.paused&&!video.ended)
        id=requestAnimationFrame(draw);
    };
    draw();
    const onPlay=()=>{if(id)cancelAnimationFrame(id);id=requestAnimationFrame(draw);};
    previewVideoRef.current?.addEventListener("play",onPlay);
    const v=previewVideoRef.current;
    return()=>{if(id)cancelAnimationFrame(id);v?.removeEventListener("play",onPlay);};
  },[dims.width,dims.height,options,mode,videoUrl,videoLength,rendering]);
  useEffect(()=>()=>{if(readyMp4)URL.revokeObjectURL(readyMp4);},[readyMp4]);

  async function downloadStatic(as:"png"|"jpeg"){
    if(exporting||!assets.background||!canvasRef.current){toast.error("Escolha uma obra e aguarde as imagens oficiais.");return;}
    setExporting(true);
    try{
      // A dedicated canvas prevents live video playback from modifying the
      // PNG/JPG while the asynchronous browser encoder is reading pixels.
      const canvas=document.createElement("canvas");
      canvas.width=dims.width;canvas.height=dims.height;
      try{
        const ctx=canvas.getContext("2d",{alpha:false});
        if(!ctx)throw new Error("Não foi possível criar a imagem.");
        renderCinematic(ctx,{...options,mode:"banner",video:null});
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
          value=>value?resolve(value):reject(new Error("A origem da imagem não permite exportação pelo navegador.")),
          as==="png"?"image/png":"image/jpeg",as==="png"?undefined:.94,
        ));
        downloadFile(blob,slug(movie?.title||"cinematic")+"-"+dims.width+"x"+dims.height+"."+(as==="png"?"png":"jpg"));
      }finally{canvas.width=0;canvas.height=0;}
      toast.success("Arte estática salva!");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao exportar imagem.")}
    finally{setExporting(false);}
  }
  async function saveVideoPolicy(){
    if(!usage.data||savingControls)return;
    setSavingControls(true);
    try{
      const value={
        defaultDailyLimit:dailyLimit,
        maxUploadMb,
        overrides:{...usage.data.policy.overrides,[ownerId]:brandDailyLimit},
      };
      await saveControls({data:value});
      await usage.refetch();
      toast.success("Limites administrativos salvos!");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao salvar limites.");}
    finally{setSavingControls(false);}
  }
  async function logVideoRender(id:string,status:"completed"|"failed",bytes:number,errorCode:"EXPORT_ERROR"|"ENCODING_UNSUPPORTED"|"INPUT_INVALID"|"DECODE_ERROR"|"UNKNOWN_ERROR"|null){
    if(!movie)return;
    try{
      await recordRender({data:{
        request_id:id,brand_owner_id:ownerId,media_type:media,
        tmdb_id:movie.tmdb_id,output_format:format as "portrait"|"story",
        seconds:clipSeconds,audio_requested:audio,status,
        bytes_out:status==="completed"?bytes:undefined,
        error_code:status==="failed"?errorCode:null,
      }});
      void usage.refetch();
    }catch{toast.warning("A arte foi processada, mas o registro administrativo não foi salvo.");}
  }
  async function downloadMp4(){
    if(busyRef.current||rendering)return;
    if(!videoUrl||!assets.background||!movie){
      toast.error("Selecione um filme ou série e carregue um MP4 por arquivo ou link direto.");return;
    }
    if(!supportedMp4Mime(audio)){
      toast.error("Este navegador não oferece exportação nativa MP4 H.264/AAC.");return;
    }
    if(videoLength<clipStart+clipSeconds-.15){
      toast.error("O vídeo enviado não possui o trecho completo.");return;
    }
    busyRef.current=true;setRendering(true);
    const requestId=crypto.randomUUID();
    setRenderProgress({percent:0,seconds:0,total:clipSeconds,stage:"Preparando os quadros do vídeo"});
    const temp=document.createElement("video");
    temp.preload="auto";temp.playsInline=true;
    if(activeVideoLink&&!videoFile)temp.crossOrigin="anonymous";
    temp.style.cssText="position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
    temp.src=videoUrl;
    document.body.appendChild(temp);
    const exportCanvas=document.createElement("canvas");
    previewVideoRef.current?.pause();
    try{
      await new Promise<void>((resolve,reject)=>{
        const onReady=()=>{clearTimeout(timeout);resolve();};
        const onError=()=>{clearTimeout(timeout);reject(new Error("O MP4 não pôde ser decodificado. Links externos precisam permitir CORS e apontar diretamente para um arquivo MP4."));};
        const timeout=setTimeout(()=>reject(new Error("Tempo esgotado ao abrir MP4.")),10000);
        temp.addEventListener("loadedmetadata",onReady,{once:true});
        temp.addEventListener("error",onError,{once:true});
        temp.load();
      });
      // Do not reuse the visible canvas: export draws to an offscreen,
      // full-resolution canvas and cannot disrupt the browser preview.
      const videoCanvas=exportCanvas;
      const recorded=await renderNativeMp4(
        videoCanvas,temp,options,clipSeconds,clipStart,audio,setRenderProgress,mp4Preset,
      );
      setRenderProgress(v=>({...v,percent:99,stage:"Finalizando MP4 para WhatsApp..."}));
      const blob=await finalizeCinematicMp4(recorded);
      setRenderProgress(v=>({...v,percent:100,stage:"MP4 compatível finalizado"}));
      const output=renderDimensions(options,mp4Preset);
      const nextUrl=URL.createObjectURL(blob);
      setReadyMp4(nextUrl);setReadyMp4Blob(blob);setReadyMp4Bytes(blob.size);
      downloadFile(blob,slug(movie.title)+"-"+(mp4Preset==="whatsapp"?"WhatsApp":"Alta") +"-"+clipSeconds+"s-"+output.width+"x"+output.height+".mp4");
      void logVideoRender(requestId,"completed",blob.size,null);
      if(mp4Preset==="whatsapp"&&blob.size>WHATSAPP_VIDEO_MAX_BYTES)
        toast.warning("MP4 criado, mas ultrapassou 16 MB. Envie como documento ou reduza a duração para WhatsApp.");
      else toast.success("MP4 H.264 gerado com a arte e o vídeo! Arquivo pronto para visualizar.");
    }catch(e){
      toast.error(e instanceof Error?e.message:"A exportação MP4 não foi concluída.");
      void logVideoRender(requestId,"failed",0,"EXPORT_ERROR");
      setRenderProgress(v=>({...v,stage:"Falha de exportação"}));
    }finally{
      temp.pause();temp.removeAttribute("src");temp.load();temp.remove();
      exportCanvas.width=0;exportCanvas.height=0;
      busyRef.current=false;setRendering(false);
    }
  }
  async function fixExistingMp4(file:File|undefined){
    if(!file)return;
    if(file.size>150*1024*1024||file.size<1024){
      toast.error("Escolha um MP4 de até 150 MB.");return;
    }
    if(fixingMp4||rendering)return;
    setFixingMp4(true);
    try{
      const converted=await finalizeCinematicMp4(file);
      const nextUrl=URL.createObjectURL(converted);
      setReadyMp4(nextUrl);
      setReadyMp4Blob(converted);
      setReadyMp4Bytes(converted.size);
      downloadFile(converted,slug(file.name.replace(/\.mp4$/i,""))+"-WhatsApp.mp4");
      if(converted.size>WHATSAPP_VIDEO_MAX_BYTES)
        toast.warning("Vídeo corrigido. Para usar pela API do WhatsApp, o arquivo deve ter até 16 MB.");
      else toast.success("MP4 corrigido: pronto para testar o envio como vídeo no WhatsApp.");
    }catch(error){
      toast.error(error instanceof Error?error.message:"Não foi possível corrigir este MP4.");
    }finally{
      setFixingMp4(false);
    }
  }
  async function shareMp4(){
    if(!readyMp4Blob){toast.error("Gere o vídeo antes de compartilhar.");return;}
    const filename=slug(movie?.title||"vitrine")+"-Vitrine-WhatsApp.mp4";
    const file=new File([readyMp4Blob],filename,{type:"video/mp4"});
    if(!navigator.share||!navigator.canShare?.({files:[file]})){
      toast.info("Este navegador não compartilha MP4 diretamente. Baixe o arquivo e envie no WhatsApp.");
      return;
    }
    try{
      await navigator.share({files:[file],title:movie?.title||"Vitrine Vídeo"});
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")return;
      toast.error("Não foi possível abrir o compartilhamento. Use o botão Baixar novamente.");
    }
  }
  function uploadLogo(file?:File){
    if(!file)return;
    if(!["image/png","image/webp","image/jpeg"].includes(file.type)||file.size>3*1024*1024){
      toast.error("Use PNG, WEBP ou JPG até 3 MB.");return;
    }
    const reader=new FileReader();
    reader.onload=()=>setLocalLogo(String(reader.result||""));
    reader.onerror=()=>toast.error("Não foi possível ler sua logo.");
    reader.readAsDataURL(file);
  }
  function uploadMp4(file?:File){
    if(!file)return;
    if(file.type!=="video/mp4"||file.size>(usage.data?.policy.maxUploadMb??350)*1024*1024||file.size<1000){
      toast.error("Escolha um MP4 de até "+(usage.data?.policy.maxUploadMb??350)+" MB.");return;
    }
    setActiveVideoLink("");setVideoLinkDraft("");setVideoFile(file);
  }
  function loadDirectMp4Link(){
    try{
      const raw=videoLinkDraft.trim();
      if(!raw||raw.length>2048)throw new Error("Informe um link direto de arquivo MP4.");
      const url=new URL(raw);
      if(url.protocol!=="https:")throw new Error("O link do MP4 precisa usar HTTPS.");
      if(/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)$/i.test(url.hostname))
        throw new Error("Esse é um link de página de vídeo, não um arquivo MP4. Use o arquivo baixado ou uma URL direta terminada em .mp4.");
      if(["localhost","127.0.0.1","0.0.0.0","::1"].includes(url.hostname))
        throw new Error("Endereços locais não são permitidos.");
      setVideoFile(null);
      setActiveVideoLink(url.href);
      setClipStart(0);
      setVideoLength(0);
      toast.info("Carregando o MP4. O servidor do arquivo precisa permitir CORS.");
    }catch(error){toast.error(error instanceof Error?error.message:"Link inválido.");}
  }
  const isReady=!!movie&&!!assets.background&&!loadingAssets;
  const itemList=((feed.data?.items??[]) as SearchItem[])
    .filter(x=>x.media_type===media&&x.poster_path)
    .slice(0,24);
  const selectedTrailer=extra?.trailers?.find(x=>x.key===chosenTrailerKey)??extra?.trailer;
  const youtubeKey=selectedTrailer?.key;
  const previewFrame=useMemo(()=>{
    if(mode!=="video"||typeof document==="undefined")return null;
    const measure=document.createElement("canvas").getContext("2d");
    return measure?cinematicVideoFrameRect(measure,options):null;
  },[mode,options]);
  const youtubeClipStart=Math.max(0,Math.min(3600,Math.floor(Number(youtubeStart)||0)));
  const youtubeClipEnd=youtubeClipStart+clipSeconds;
  const youtubeEmbed=typeof youtubeKey==="string"&&/^[a-zA-Z0-9_-]{11}$/.test(youtubeKey)
    ?`https://www.youtube-nocookie.com/embed/${youtubeKey}?playsinline=1&controls=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(typeof window!=="undefined"?window.location.origin:"https://streammonitor.site")}&start=${youtubeClipStart}&end=${youtubeClipEnd}`
    :null;
  const mime=supportedMp4Mime(audio);
  return <div className="min-h-screen bg-[#050a14] px-3 py-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1550px] space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-blue-500/25 bg-gradient-to-r from-[#0b203b] via-[#071526] to-[#08101f] p-6 shadow-xl shadow-blue-950/40 sm:p-8">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"/>
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-400/10 px-3 py-1 text-xs font-bold tracking-wide text-blue-200">
              <ShieldCheck className="h-4 w-4"/> ADMINISTRADOR · TESTE CONTROLADO
            </span>
            <h1 className="mt-3 flex items-center gap-3 text-3xl font-black sm:text-4xl">
              {mode==="video"?<Clapperboard className="h-9 w-9 text-blue-400"/>:<Film className="h-9 w-9 text-blue-400"/>}
              {mode==="video"?"Vitrine Vídeo MP4":"Banner Cinematográfico"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Artes cinematográficas com fotos oficiais da TMDB, identidade da revenda e conteúdo fiel à obra.
              {mode==="video"?" Trailer na prévia e exportação MP4 com o vídeo integrado.":" Sem IA gerando fundos, sem players ou elementos de vídeo."}
            </p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-bold tracking-wide text-blue-100">
            {mode==="video"?"APENAS ADMIN · /vitrine-video":"TODOS OS USUÁRIOS · /vitrine-banner"}
          </div>
        </div>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(370px,510px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className={panelClass+" space-y-4"}>
            <div className="flex items-center gap-2 text-sm font-bold text-blue-200"><Search size={18}/> 1. Filme ou série oficial</div>
            <div className="grid grid-cols-2 gap-2">
              {(["movie","tv"] as const).map(x=><button type="button" key={x}
                className={"rounded-xl border px-4 py-2 text-sm font-bold "+(media===x?"border-blue-400 bg-blue-600":"border-white/15 bg-white/5")}
                onClick={()=>{setMedia(x);setSelectedId(null);setBackdropChoice("");}}>
                {x==="movie"?"Filmes":"Séries"}
              </button>)}
            </div>
            <Input value={search} onChange={e=>{setSearch(e.target.value);setSelectedId(null);}}
              className="border-blue-400/25 bg-slate-950/80" maxLength={120}
              placeholder="Pesquisar títulos na TMDB"/>
            <p className="text-xs text-slate-400">{feed.isLoading?"Consultando TMDB...":"Selecione um título. As imagens serão somente desta obra."}</p>
            {feed.isError&&<p className="text-sm text-amber-300">Não foi possível consultar a TMDB. Verifique a API.</p>}
            <div className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto pr-1">
              {itemList.map(item=><button type="button" key={item.media_type+"-"+item.tmdb_id}
                onClick={()=>{setSelectedId(item.tmdb_id);setBackdropChoice("");}}
                className={"overflow-hidden rounded-xl border-2 p-1 text-left transition "+(selectedId===item.tmdb_id?"border-blue-400 bg-blue-600/15":"border-white/10 hover:border-blue-400/50")}>
                <img src={tmdbPath(item.poster_path,"w500")} alt={item.title}
                  className="aspect-[2/3] w-full rounded-lg bg-slate-900 object-contain" loading="lazy"/>
                <span className="mt-1 block truncate px-1 text-[11px]">{item.title}</span>
              </button>)}
            </div>
            {detail.isLoading&&<p className="text-sm text-sky-300">Carregando sinopse, imagens e vídeos oficiais...</p>}
            {detail.isError&&<p className="text-sm text-amber-300">Dados oficiais indisponíveis para este título.</p>}
            {extra?.backdrops&&extra.backdrops.length>0&&<div className="space-y-2">
              <p className="text-xs text-slate-300">Fundo oficial: escolha uma das imagens deste título</p>
              <div className="grid grid-cols-3 gap-2">
                {extra.backdrops.slice(0,6).map(path=><button type="button" key={path}
                  onClick={()=>setBackdropChoice(path)}
                  className={"overflow-hidden rounded-lg border-2 "+(selectedBackground===path?"border-blue-400":"border-white/10")}>
                  <img src={tmdbPath(path,"w500")} alt="Backdrop oficial TMDB" loading="lazy" className="aspect-video w-full object-cover"/>
                </button>)}
              </div>
            </div>}
          </section>
          <section className={panelClass+" space-y-3"}>
            <div className="flex items-center gap-2 text-sm font-bold text-blue-200"><Palette size={18}/> 2. Identidade e composição</div>
            <label className="block space-y-1 text-xs text-slate-300">Identidade cadastrada da revenda
              <select className={"w-full "+inputClass} value={brandId||brands.data?.currentOwner||""}
                onChange={e=>{setBrandId(e.target.value);setBrandOverrides({});setLocalLogo("");}}>
                {brandList.map(x=><option key={x.owner_id} value={x.owner_id}>{x.name}</option>)}
              </select>
            </label>
            {brands.isError&&<p className="text-xs text-amber-300">Identidades não disponíveis no momento.</p>}
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-slate-300">Nome da revenda (não aparece na arte)
                <Input value={brand.name} maxLength={55} className={inputClass} onChange={e=>setBrandOverrides(v=>({...v,name:e.target.value}))}/>
              </label>
              <label className="space-y-1 text-xs text-slate-300">WhatsApp com DDD
                <Input value={formatCinematicWhatsApp(brand.whatsapp)} maxLength={22} className={inputClass} inputMode="tel"
                  onChange={e=>setBrandOverrides(v=>({...v,whatsapp:e.target.value.replace(/\D/g,"").slice(0,13)}))}/>
              </label>
            </div>
            <label className="block space-y-1 text-xs text-slate-300">Logo em PNG transparente (JPG/WEBP convertidos na prévia)
              <Input type="file" accept="image/png,image/webp,image/jpeg"
                className="border-blue-500/20 bg-slate-950 text-xs file:text-blue-200"
                onChange={e=>uploadLogo(e.target.files?.[0])}/>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-slate-300">Etiqueta
                <select className={"w-full "+inputClass} value={label} onChange={e=>setLabel(e.target.value)}>
                  {labels.map(x=><option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-300">Formato
                <select className={"w-full "+inputClass} value={format} onChange={e=>setFormat(e.target.value as CinematicFormat)}>
                  {Object.entries(cinematicFormats).filter(([key])=>mode==="banner"||key==="portrait"||key==="story")
                    .map(([key,x])=><option key={key} value={key}>{x.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-300">Cor de destaque
                <Input type="color" value={color} onChange={e=>setColor(e.target.value)} className="h-10 w-full border border-blue-500/20 bg-slate-900 p-1"/>
              </label>
              <label className="space-y-1 text-xs text-slate-300">Iluminação
                <select className={"w-full "+inputClass} value={lighting} onChange={e=>setLighting(e.target.value as "natural"|"blue"|"warm")}>
                  <option value="natural">Original</option><option value="blue">Azul cinematográfico</option><option value="warm">Quente cinematográfico</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-300">Posição da logo
                <select className={"w-full "+inputClass} value={logoPosition} onChange={e=>setLogoPosition(e.target.value as "left"|"right")}>
                  <option value="left">Esquerda</option><option value="right">Direita</option>
                </select>
              </label>
              {mode==="banner"&&<label className="flex items-center gap-2 self-end pb-3 text-xs text-slate-200">
                <input type="checkbox" checked={posterVisible} onChange={e=>setPosterVisible(e.target.checked)}/>
                Pôster oficial em destaque
              </label>}
            </div>
            <label className="block space-y-1 text-xs text-slate-300">Sinopse em português (editável)
              <textarea value={description} maxLength={480} rows={4}
                className={"w-full resize-y py-3 "+inputClass+" h-auto min-h-[108px]"}
                onChange={e=>setDescription(e.target.value)}/>
            </label>
            <p className="text-[11px] leading-5 text-blue-200/80">
              O texto da arte é adaptado automaticamente ao formato Feed ou Stories, sem reticências
              e sem cobrir o vídeo ou o contato. A sinopse original permanece editável aqui.
            </p>
            {loadingAssets&&<p className="flex items-center gap-2 text-xs text-blue-200"><RefreshCw size={15} className="animate-spin"/>Preparando imagens originais...</p>}
            {assets.error&&<p className="text-xs text-amber-300">{assets.error}</p>}
            {assets.warning&&<p className="text-xs text-amber-300">{assets.warning}</p>}
            <details className="rounded-lg border border-white/10 bg-slate-950/45 p-3 text-[11px] text-slate-400">
              <summary className="cursor-pointer text-slate-300">Informações da fonte do catálogo</summary>
              <div className="mt-2 space-y-2">
                <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
                  <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg"
                    alt="TMDB" className="h-5 w-auto max-w-[106px]" loading="lazy"/>
                </a>
                <p>Este produto utiliza a API TMDB, mas não é endossado ou certificado pela TMDB.</p>
                <a href="https://www.themoviedb.org/about/logos-attribution" target="_blank" rel="noopener noreferrer"
                   className="underline underline-offset-2">Atribuição e condições da fonte</a>
              </div>
            </details>
          </section>
          {mode==="video"&&<section className={panelClass+" space-y-3"}>
            <div className="flex items-center gap-2 text-sm font-bold text-blue-200"><Clapperboard size={18}/> 3. Trailer real e exportação MP4</div>
            {youtubeKey?<div className="space-y-2">
              <p className="text-xs text-slate-300">Trailer encontrado na TMDB · {selectedTrailer?.official?"oficial":"referenciado"} · idioma {selectedTrailer?.language||"não informado"}.</p>
              {(extra?.trailers?.length??0)>1&&(
                <label className="block space-y-1 text-xs text-slate-300">Escolher outro trailer desta obra
                  <select className={"w-full "+inputClass} value={youtubeKey||""}
                    onChange={e=>setChosenTrailerKey(e.target.value)}>
                    {extra?.trailers?.map(t=><option key={t.key} value={t.key}>
                      {t.name} · {t.language||"idioma não informado"}{t.official?" · oficial":""}
                    </option>)}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-slate-300">Duração da prévia
                  <select className={"w-full "+inputClass} value={clipSeconds}
                    onChange={e=>setClipSeconds(Number(e.target.value) as 15|30|60)}>
                    <option value={15}>15 segundos</option><option value={30}>30 segundos</option><option value={60}>60 segundos</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-slate-300">Começar em (segundos)
                  <Input className={inputClass} type="number" min={0} max={3600} value={youtubeStart}
                    onChange={e=>setYoutubeStart(Math.max(0,Math.min(3600,Math.floor(Number(e.target.value)||0))))}/>
                </label>
              </div>
              <p className="rounded-lg border border-blue-400/20 bg-blue-500/5 p-3 text-[11px] text-sky-100">
                Assista ao trailer na prévia. Para baixar o post com vídeo, use um MP4 salvo no computador ou um link direto para o arquivo. Sem gravação de aba.
              </p>
            </div>:<p className="text-xs text-amber-300">A TMDB não indicou trailer do YouTube para este título.</p>}
            <label className="block space-y-2 text-xs text-slate-300"><span className="flex items-center gap-2"><Upload size={15}/> Escolher MP4 do computador</span>
              <Input type="file" accept=".mp4,video/mp4"
                className="border-blue-500/20 bg-slate-950 text-xs file:text-blue-200"
                onChange={e=>uploadMp4(e.target.files?.[0])}/>
            </label>
            <div className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-950/15 p-3">
              <label className="block space-y-1 text-xs text-slate-300">
                Link direto de vídeo MP4 (opcional)
                <Input className={inputClass} type="url" value={videoLinkDraft} maxLength={2048}
                  onChange={e=>setVideoLinkDraft(e.target.value)}
                  placeholder="https://meu-servidor.com/video.mp4"/>
              </label>
              <Button type="button" size="sm" variant="outline" className="border-blue-400/30 text-blue-100"
                onClick={loadDirectMp4Link} disabled={!videoLinkDraft.trim()}>Carregar link MP4</Button>
              <p className="text-[11px] leading-5 text-slate-400">
                Links do YouTube funcionam apenas na prévia; para gerar o arquivo final, o endereço precisa fornecer o MP4 diretamente com CORS.
                Se estiver usando o programa 4K Video Downloader Plus no computador, selecione o MP4 salvo pelo botão acima.
              </p>
              <a href="https://www.4kdownload.com/pt-br/products/videodownloader-8" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-sky-300 underline underline-offset-2">
                4K Video Downloader Plus — site oficial (aplicativo externo)
              </a>
            </div>
            {videoUrl&&<div className="space-y-2">
              <p className="text-xs text-sky-300">{videoFile?.name} · {videoLength?Math.floor(videoLength)+" s":"Lendo duração..."}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-slate-300">Trecho
                  <select className={"w-full "+inputClass} value={clipSeconds} onChange={e=>setClipSeconds(Number(e.target.value) as 15|30|60)}>
                    <option value={15}>15 segundos</option><option value={30}>30 segundos</option><option value={60}>60 segundos</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-slate-300">Início em segundos
                  <Input className={inputClass} type="number" min={0} max={Math.max(0,videoLength-clipSeconds)}
                    value={clipStart} onChange={e=>setClipStart(Math.max(0,Math.floor(Number(e.target.value)||0)))}/>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={audio} disabled={!supportedMp4Mime(true)} onChange={e=>setAudio(e.target.checked)}/> <Music2 size={15}/> Áudio AAC {supportedMp4Mime(true)?"":"(não suportado neste navegador)"}</label>
                <Button variant="outline" size="sm" onClick={()=>{
                  const video=previewVideoRef.current;
                  if(!video)return;
                  if(video.paused){video.muted=!audio;void video.play().catch(()=>toast.error("Não foi possível reproduzir este arquivo."));}
                  else video.pause();
                }}><Play size={14} className="mr-2"/>Reproduzir/pausar na arte</Button>
              </div>
            </div>}
            <label className="block space-y-1 text-xs text-slate-300">
              Qualidade do vídeo exportado
              <select className={"w-full "+inputClass} value={mp4Preset}
                onChange={e=>setMp4Preset(e.target.value as Mp4Preset)}>
                <option value="whatsapp">WhatsApp · 720 px · MP4 leve (recomendado)</option>
                <option value="full">Alta qualidade · 1080 px · MP4 maior</option>
              </select>
            </label>
            <p className="text-[11px] text-slate-400">
              Modo WhatsApp: 720 × {format==="story"?1280:900} px, H.264, áudio AAC quando suportado.
              O arquivo é conferido após exportar; o limite para vídeos pela API do WhatsApp é 16 MB.
            </p>
            <div className={"rounded-lg border p-3 text-xs "+(mime?"border-emerald-500/20 bg-emerald-500/10 text-emerald-200":"border-amber-500/30 bg-amber-500/10 text-amber-200")}>
              {mime?"Este navegador informa suporte à exportação MP4 H.264"+(audio?"/AAC":"")+". O vídeo enviado é processado localmente, sem captura de aba.":"Este navegador não informa suporte à geração nativa de MP4 H.264"+(audio?"/AAC":"")+". Teste pelo computador ou utilize um navegador compatível."}
            </div>
            <p className="text-[11px] text-slate-400">Processamento local, sem gravar a aba ou enviar o vídeo ao servidor. Mantenha esta página aberta enquanto gera o MP4. O modo WhatsApp reduz o peso do arquivo; sem suporte a AAC, a exportação fica sem áudio.</p>
          </section>}
          {mode==="video"&&<section className={panelClass+" space-y-3"}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-blue-200">Administração · limites e histórico</h3>
              <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-200">Apenas admin</span>
            </div>
            <p className="text-xs text-slate-400">Administradores podem testar livremente. As cotas abaixo ficam salvas para quando o acesso dos revendedores for habilitado, mas não são aplicadas nesta fase.</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/5 p-3 text-center"><p className="text-xl font-bold">{usage.data?.summary.completed??"—"}</p><p className="text-[11px] text-slate-400">MP4 concluídos (30d)</p></div>
              <div className="rounded-lg bg-white/5 p-3 text-center"><p className="text-xl font-bold">{usage.data?.summary.errors??"—"}</p><p className="text-[11px] text-slate-400">Falhas (30d)</p></div>
              <div className="rounded-lg bg-white/5 p-3 text-center"><p className="text-xl font-bold">{usage.data?Math.round(usage.data.summary.exportedBytes/1024/1024)+" MB":"—"}</p><p className="text-[11px] text-slate-400">MP4 exportados (30d)</p></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1 text-[11px] text-slate-300">Cota padrão/dia
                <Input className={inputClass} type="number" min={1} max={50} value={dailyLimit} onChange={e=>setDailyLimit(Number(e.target.value))}/>
              </label>
              <label className="space-y-1 text-[11px] text-slate-300">Cota desta revenda
                <Input className={inputClass} type="number" min={0} max={50} value={brandDailyLimit} onChange={e=>setBrandDailyLimit(Number(e.target.value))}/>
              </label>
              <label className="space-y-1 text-[11px] text-slate-300">Upload máximo MB
                <Input className={inputClass} type="number" min={25} max={350} value={maxUploadMb} onChange={e=>setMaxUploadMb(Number(e.target.value))}/>
              </label>
            </div>
            <Button type="button" variant="outline" className="w-full border-blue-400/30 text-sky-100" disabled={!usage.data||savingControls}
              onClick={()=>void saveVideoPolicy()}>{savingControls?"Salvando limites...":"Salvar configurações de geração"}</Button>
            {usage.isError&&<p className="text-xs text-amber-300">Não foi possível carregar o histórico administrativo.</p>}
            {usage.data?.recentErrors?.length? <div className="space-y-1 border-t border-white/10 pt-3 text-xs text-amber-200">
              <p className="font-bold">Falhas recentes</p>
              {usage.data.recentErrors.slice(0,5).map((x,i)=><p key={i}>{new Date(x.at).toLocaleString("pt-BR")} · {x.code}</p>)}
            </div>:null}
            <p className="text-[11px] text-slate-500">Registros incluem somente o resultado, formato e tamanho do MP4 exportado no navegador. Nenhum arquivo de vídeo é enviado ao banco.</p>
          </section>}
        </div>
        <div className="space-y-4 xl:sticky xl:top-4">
          <section className={panelClass+" space-y-4"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-black text-white">Prévia da arte final</h2>
              <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">{dims.width} × {dims.height}</span>
            </div>
            <div className="relative mx-auto max-w-[620px] overflow-hidden rounded-xl border border-white/15 bg-slate-950 shadow-2xl shadow-blue-950/50">
              <canvas ref={canvasRef} width={dims.width} height={dims.height}
                className="block h-auto w-full" aria-label="Prévia cinematográfica com imagens oficiais da TMDB"/>
              {mode==="video"&&!videoUrl&&youtubeEmbed&&previewFrame&&isReady&&(
                <div className="absolute overflow-hidden rounded-[9px] border border-blue-400/70 bg-black shadow-xl shadow-blue-500/40"
                  style={{
                    left:(previewFrame.x/dims.width*100)+"%",
                    top:(previewFrame.y/dims.height*100)+"%",
                    width:(previewFrame.width/dims.width*100)+"%",
                    height:(previewFrame.height/dims.height*100)+"%",
                  }}>
                  <iframe key={youtubeEmbed} title={"Trailer dentro da Vitrine: "+(movie?.title||"")}
                    src={youtubeEmbed} loading="lazy" allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
                    className="h-full w-full border-0"/>
                </div>
              )}
            </div>
            <video ref={previewVideoRef} src={videoUrl||undefined} crossOrigin={activeVideoLink&&!videoFile?"anonymous":undefined} preload="metadata" playsInline
              className="hidden"
              onError={()=>{if(videoUrl)toast.error("O arquivo não abriu. Links externos precisam ser MP4 direto e permitir CORS.");}}
              onLoadedMetadata={e=>{const length=e.currentTarget.duration;setVideoLength(Number.isFinite(length)?length:0);}}
              onTimeUpdate={()=>{
                const v=previewVideoRef.current;
                if(v&&v.currentTime>clipStart+clipSeconds)v.pause();
              }}/>
            {!movie&&<p className="text-center text-sm text-amber-200">Selecione um filme ou uma série para criar a prévia com o fundo oficial.</p>}
            {mode==="video"&&!videoUrl&&<p className="text-center text-xs text-amber-200">O trailer aparece na prévia. Para baixar o post com vídeo, escolha o MP4 ou use um link direto, sem gravar a tela.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="bg-blue-600 text-white hover:bg-blue-500" disabled={!isReady||exporting||rendering}
                onClick={()=>void downloadStatic("png")}>
                <ImageIcon size={17} className="mr-2"/>{exporting?"Preparando...":mode==="video"?"Banner PNG sem vídeo":"Baixar PNG"}
              </Button>
              {mode==="banner"?<Button className="border border-blue-400/25 bg-blue-900/40 text-white hover:bg-blue-700/40"
                  disabled={!isReady||exporting}
                  onClick={()=>void downloadStatic("jpeg")}>
                  <Download size={17} className="mr-2"/>Baixar JPG
                </Button>:
                <Button className="bg-indigo-600 text-white hover:bg-indigo-500"
                  disabled={!isReady||!videoUrl||!mime||rendering||videoLength<clipStart+clipSeconds-.15}
                  onClick={()=>void downloadMp4()}>
                  <Clapperboard size={17} className="mr-2"/>{rendering?"Gerando MP4...":"Gerar MP4"}
                </Button>}
            </div>
            {mode==="video"&&renderProgress.stage&&<div className="space-y-2 rounded-xl border border-blue-400/20 bg-blue-500/5 p-3">
              <div className="flex items-center justify-between text-xs text-blue-100">
                <span>{renderProgress.stage}</span><span>{renderProgress.percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-blue-500 transition-[width] duration-150" style={{width:renderProgress.percent+"%"}}/>
              </div>
              <span className="text-[11px] text-slate-400">{Math.round(renderProgress.seconds)} / {renderProgress.total} segundos de vídeo renderizados</span>
            </div>}
            {mode==="video"&&<div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-950/25 p-3">
              <p className="text-sm font-bold text-sky-100">Corrigir MP4 que já foi baixado</p>
              <p className="text-xs text-slate-300">Se o vídeo antigo toca no navegador mas não envia no WhatsApp, selecione o arquivo aqui. O sistema ajusta o formato sem recomprimir nem mudar a arte.</p>
              <Input type="file" accept=".mp4,video/mp4" disabled={fixingMp4||rendering}
                className="border-blue-500/20 bg-slate-950 text-xs file:text-blue-200"
                onChange={e=>{void fixExistingMp4(e.target.files?.[0]);e.target.value="";}}/>
              {fixingMp4&&<p className="text-xs text-sky-200"><RefreshCw size={14} className="mr-2 inline animate-spin"/>Finalizando para WhatsApp...</p>}
            </div>}
            {mode==="video"&&readyMp4&&<div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 size={17}/> MP4 criado · {(readyMp4Bytes/1024/1024).toFixed(1)} MB</div>
              <video controls playsInline src={readyMp4} className="aspect-[4/5] max-h-[420px] w-full rounded-lg bg-black object-contain"/>
              <div className="flex flex-wrap gap-2">
                <a href={readyMp4} download={slug(movie?.title||"vitrine")+"-vitrine.mp4"}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 px-4 py-2 text-sm text-white hover:bg-emerald-500/10">
                  <Download size={17}/> Baixar MP4
                </a>
                <Button type="button" variant="outline" className="border-green-500/40 bg-green-500/10 text-green-200"
                  onClick={()=>void shareMp4()}>
                  <Share2 size={17} className="mr-2"/> Compartilhar no celular
                </Button>
              </div>
              {readyMp4Bytes>WHATSAPP_VIDEO_MAX_BYTES&&(
                <p className="text-xs text-amber-200">
                  Este arquivo ultrapassa 16 MB, o limite de vídeo da API WhatsApp Business.
                  Tente o modo WhatsApp e reduza a duração.
                </p>
              )}
            </div>}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck size={14} className="text-sky-300"/> Imagens oficiais somente do título selecionado
              {mode==="video"&&<><span>·</span><Clock3 size={14}/>15/30/60 segundos</>}
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>;
}
