import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toBlob, toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { prepareTransparentLogo } from "@/lib/vitrine-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, RefreshCw, Trophy, Send, X, Image as ImageIcon } from "lucide-react";
import { FootballSchedulePoster, FOOTBALL_POSTER_PALETTES } from "@/components/vitrine/football-schedule-poster";
import { getVitrineFootballMatches, type FootballMatch } from "@/lib/vitrine-football.functions";
import { getVitrineFootballExportImages } from "@/lib/vitrine-football-export.functions";
import { drawFootballPngFallback } from "@/lib/vitrine-football-canvas-fallback";
import { sendVitrineFootballToRegisteredTelegram } from "@/lib/vitrine-football-telegram.functions";

const today = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
type Branding = { name: string; logo: string; contact: string; accent: string };
const fallbackBrand: Branding = {name:"Stream Monitor",logo:"/favicon.ico",contact:"",accent:"#146df2"};
const baseSize = 1080;
/** Measure the actual artwork card rather than the entire dashboard width. */
function ResponsivePoster({children}:{children:ReactNode}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size,setSize] = useState(520);
  useEffect(()=>{
    const element=frame.current;
    if(!element)return;
    const update=()=>setSize(Math.max(1,Math.min(550,element.clientWidth)));
    update();
    const observer=new ResizeObserver(update);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  return <div ref={frame} className="relative mx-auto aspect-square w-full min-w-0 max-w-[550px] overflow-hidden rounded-xl">
    <div style={{width:baseSize,height:baseSize,transform:"scale("+(size/baseSize)+")",transformOrigin:"top left"}}>
      <div style={{width:baseSize,height:baseSize}}>{children}</div>
    </div>
  </div>;
}
const safeColor = (input: string | undefined) => /^#[0-9a-f]{6}$/i.test(input||"") ? input! : "#146df2";

/** Automated posters: four fixtures (eight clubs) per artwork, with automatic pagination. */
export function VitrineFootballStudio() {
  const load = useServerFn(getVitrineFootballMatches);
  const inlineAssets = useServerFn(getVitrineFootballExportImages);
  const sendRegisteredTelegram = useServerFn(sendVitrineFootballToRegisteredTelegram);
  const [brand, setBrand] = useState<Branding>(fallbackBrand);
  const [transparentLogo, setTransparentLogo] = useState(fallbackBrand.logo);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [colorStorageKey, setColorStorageKey] = useState<string | null>(null);
  // Render PNGs before tapping: iOS Web Share needs an active user gesture.
  const [preparedExports,setPreparedExports]=useState<Record<number,{signature:string;file:File}>>({});
  const [prepareErrors,setPrepareErrors]=useState<Record<number,string>>({});
  const [retrying,setRetrying]=useState<number|null>(null);
  const [telegramSending,setTelegramSending]=useState(false);
  const [imagePreview, setImagePreview] = useState<{url:string;name:string;index:number;file:File}|null>(null);
  const imagePreviewUrl = useRef<string|null>(null);
  const exportRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [day, setDay] = useState(today);

  useEffect(() => {
    let active = true;
    async function fetchBrand() {
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) return;
      const storageKey="streammonitor-football-color:"+user.id;
      setColorStorageKey(storageKey);
      try {
        const stored=window.localStorage.getItem(storageKey);
        setSelectedColor(stored && /^#[0-9a-f]{6}$/i.test(stored) ? stored : null);
      } catch { setSelectedColor(null); }
      const [promo, page, profile] = await Promise.all([
        supabase.from("promo_brand_settings" as any).select("brand_name,logo_url,whatsapp,primary_color").eq("owner_id",user.id).maybeSingle(),
        supabase.from("reseller_pages" as any).select("display_name,logo_url,whatsapp,primary_color").eq("owner_id",user.id).maybeSingle(),
        supabase.from("profiles").select("full_name,whatsapp,phone").eq("id",user.id).maybeSingle(),
      ]);
      if (!active) return;
      const p = promo.data as {brand_name?:string;logo_url?:string;whatsapp?:string;primary_color?:string} | null;
      const r = page.data as {display_name?:string;logo_url?:string;whatsapp?:string;primary_color?:string} | null;
      const u = profile.data as {full_name?:string;whatsapp?:string;phone?:string} | null;
      setBrand({
        name:p?.brand_name||r?.display_name||u?.full_name||"Stream Monitor",
        logo:p?.logo_url||r?.logo_url||"/favicon.ico",
        contact:p?.whatsapp||r?.whatsapp||u?.whatsapp||u?.phone||"",
        accent:safeColor(p?.primary_color||r?.primary_color),
      });
    }
    void fetchBrand();
    return () => {active=false;};
  }, []);

  useEffect(() => {
    let cancelled=false;
    setTransparentLogo(brand.logo);
    void prepareTransparentLogo(brand.logo).then(value=>{if(!cancelled)setTransparentLogo(value);});
    return ()=>{cancelled=true};
  },[brand.logo]);

  const accent=selectedColor||brand.accent;
  const chooseColor=(value:string)=>{
    const color=safeColor(value);
    setSelectedColor(color);
    if(colorStorageKey){
      try{window.localStorage.setItem(colorStorageKey,color)}catch{/* Private browsing can block local storage. */}
    }
  };

  const games = useQuery({
    queryKey:["vitrine-football-ftwb",day],
    queryFn:()=>load({data:{date:day}}),
    staleTime:5*60_000,
    retry:1,
  });
  const groups = useMemo(() => {
    const matches = games.data?.matches ?? [];
    const chunks:FootballMatch[][]=[];
    for(let i=0;i<matches.length;i+=4)chunks.push(matches.slice(i,i+4));
    return chunks;
  }, [games.data]);
  const [validatedPhotos,setValidatedPhotos]=useState<Record<string,boolean>>({});
  useEffect(()=>{
    let mounted=true;
    const urls=[...new Set(groups.map(group=>group.find(match=>!!match.playerPhoto)?.playerPhoto).filter((url):url is string=>!!url))];
    for(const url of urls){
      const image=new Image();
      image.crossOrigin="anonymous";
      image.onload=()=>{if(mounted)setValidatedPhotos(prev=>({...prev,[url]:true}))};
      image.onerror=()=>{if(mounted)setValidatedPhotos(prev=>({...prev,[url]:false}))};
      image.src=url;
    }
    return ()=>{mounted=false};
  },[groups]);
  const exportSignature=useMemo(()=>JSON.stringify({
    day,accent,brand,transparentLogo,groups,validatedPhotos
  }),[day,accent,brand,transparentLogo,groups,validatedPhotos]);
  const haveChannels = (match:FootballMatch) => (match.broadcasts||[]).slice(0,3).join(" • ") || "Sem transmissão";

  const renderArtwork=(group:FootballMatch[])=>{
    const featured=group.find(match=>!!match.playerPhoto&&validatedPhotos[match.playerPhoto]===true);
    const badgeImages:Record<string,string>={};
    for(const match of group){
      if(match.homeBadge)badgeImages[match.homeBadge]=match.homeBadge;
      if(match.awayBadge)badgeImages[match.awayBadge]=match.awayBadge;
    }
    const channels=Object.fromEntries(group.map(match=>[match.id,haveChannels(match)]));
    return <FootballSchedulePoster kind="today" format="feed" matches={group} day={day}
      headline="EVENTOS DE HOJE" brand={brand.name} logo={transparentLogo} contact={brand.contact}
      badgeImages={badgeImages} broadcastByMatch={channels}
      playerPhoto={featured?.playerPhoto||""} playerName={featured?.playerName||""}
      stadium="" accent={accent}/>;
  };



  useEffect(()=>()=>{if(imagePreviewUrl.current)URL.revokeObjectURL(imagePreviewUrl.current);},[]);

  function showImage(file:File,index:number){
    if(imagePreviewUrl.current)URL.revokeObjectURL(imagePreviewUrl.current);
    const url=URL.createObjectURL(file);
    imagePreviewUrl.current=url;
    setImagePreview({url,name:file.name,index,file});
  }
  function closeImage(){
    setImagePreview(null);
    // Keep the blob URL alive until after React unmounts the preview image.
  }
  async function awaitAssets(node:HTMLElement){
    if(document.fonts?.ready){
      await Promise.race([document.fonts.ready,new Promise<void>(resolve=>setTimeout(resolve,3000))]);
    }
    const images=Array.from(node.querySelectorAll("img"));
    await Promise.all(images.map(img=>Promise.race([
      img.decode ? img.decode().catch(()=>{}) : Promise.resolve(),
      new Promise<void>(resolve=>setTimeout(resolve,4500))
    ])));
  }
  /** Make the export independent of mobile CSS scaling and avoid external CORS failures.
   * Only the off-screen copy is altered; the visible poster remains untouched.
   */
  async function inlinePosterAssets(node:HTMLElement):Promise<()=>void>{
    const images=Array.from(node.querySelectorAll("img"));
    const urls=[...new Set(images.map(img=>img.src).filter(src=>/^https:\/\//i.test(src)))];
    if(!urls.length)return ()=>{};
    const oldSources=images.map(img=>[img,img.src] as const);
    let assets:{images:Record<string,string>};
    try{
      assets=await inlineAssets({data:{urls:urls.slice(0,16)}});
    }catch{
      // If the image proxy is temporarily unavailable, attempt the original
      // export normally instead of blocking all downloads.
      return ()=>{};
    }
    for(const image of images){
      const replacement=assets.images[image.src];
      if(replacement){
        image.style.display="";
        image.src=replacement;
      }
    }
    await awaitAssets(node);
    return ()=>{
      for(const [image,src] of oldSources){
        if(image.src!==src)image.src=src;
      }
    };
  }
  async function createPngFile(index:number):Promise<{file:File;degraded:boolean}>{
    // The small preview is under a CSS transform; exporting it on Safari crops content.
    // Always render the independent original-size artwork instead.
    const node=exportRefs.current[index];
    if(!node)throw new Error("Arte completa ainda não carregada.");
    await awaitAssets(node);
    const restore=await inlinePosterAssets(node);
    const options={
      width:baseSize,height:baseSize,pixelRatio:1,backgroundColor:"#071227",
      cacheBust:false,skipAutoScale:true,
    };
    try{
      let blob:Blob|null=null;
      try{blob=await toBlob(node,options);}catch{/* Retry without remote font embedding. */}
      if(!blob||blob.size<1000){
        try{blob=await toBlob(node,{...options,skipFonts:true});}catch{/* Try data URL fallback. */}
      }
      if(!blob||blob.size<1000){
        try{
          const data=await toPng(node,{...options,skipFonts:true});
          blob=await (await fetch(data)).blob();
        }catch{/* The user receives an explicit error, never a silently incomplete PNG. */}
      }
      const name="stream-monitor-futebol-"+day+"-arte-"+(index+1)+".png";
      // Verify PNG IHDR before use; Safari occasionally produces a truncated image.
      let valid=false;
      if(blob && blob.size>1000){
        const head=await blob.slice(0,24).arrayBuffer();
        if(head.byteLength===24){
          const data=new DataView(head);
          valid=data.getUint32(0)===0x89504e47 &&
            data.getUint32(4)===0x0d0a1a0a &&
            data.getUint32(16)===baseSize && data.getUint32(20)===baseSize;
        }
      }
      if(valid && blob)return {file:new File([blob],name,{type:"image/png"}),degraded:false};
      // Last-resort native Canvas renderer: text, matches, broadcasters and
      // contacts survive even when WebKit blocks html-to-image foreignObject.
      const fallback=await drawFootballPngFallback({
        matches:groups[index]||[],day,accent,logo:transparentLogo,
        contact:brand.contact,name:brand.name,filename:name
      });
      return {file:fallback,degraded:true};
    }finally{restore();}
  }
  function downloadBlob(file:File){
    const url=URL.createObjectURL(file);
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download=file.name;
    anchor.rel="noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  // Prepare full-size artifacts before the click: iOS needs an active user gesture.
  useEffect(()=>{
    let cancelled=false;
    setPreparedExports({});
    setPrepareErrors({});
    const handle=window.setTimeout(()=>{
      void (async()=>{
        for(let i=0;i<groups.length&&!cancelled;i++){
          try{
            const {file}=await createPngFile(i);
            if(!cancelled)setPreparedExports(prev=>({...prev,[i]:{signature:exportSignature,file}}));
          }catch(error){
            if(!cancelled)setPrepareErrors(prev=>({...prev,[i]:
              error instanceof Error?error.message:"Não foi possível gerar o PNG."}));
          }
        }
      })();
    },160);
    return ()=>{cancelled=true;window.clearTimeout(handle)};
  },[exportSignature]);

  const readyFile=(index:number)=>{
    const cached=preparedExports[index];
    return cached?.signature===exportSignature?cached.file:null;
  };
  async function retryExport(index:number){
    if(retrying!==null)return;
    setRetrying(index);
    setPrepareErrors(prev=>{const next={...prev};delete next[index];return next});
    try{
      const {file}=await createPngFile(index);
      setPreparedExports(prev=>({...prev,[index]:{signature:exportSignature,file}}));
      toast.success("Arte pronta. Agora você pode baixar ou enviar ao Telegram.");
    }catch(error){
      const message=error instanceof Error?error.message:"Falha na geração do PNG.";
      setPrepareErrors(prev=>({...prev,[index]:message}));
      toast.error(message);
    }finally{
      setRetrying(null);
    }
  }

  async function sendImageToMyTelegram(file:File){
    if(telegramSending)return;
    setTelegramSending(true);
    try{
      if(file.size>9*1024*1024){
        throw new Error("Este PNG excede o limite de 9 MB para envio pelo bot.");
      }
      // Bot credentials and the recipient chat are resolved on the server,
      // using only Telegram channels active for the signed-in reseller.
      const pngDataUrl=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>{
          const result=reader.result;
          if(typeof result==="string")resolve(result);
          else reject(new Error("Não foi possível abrir o PNG para envio."));
        };
        reader.onerror=()=>reject(new Error("Falha ao ler o arquivo PNG."));
        reader.readAsDataURL(file);
      });
      const result=await sendRegisteredTelegram({data:{pngDataUrl,date:day}});
      if(!result?.ok)throw new Error("Telegram não confirmou o recebimento.");
      toast.success("Banner enviado ao Telegram cadastrado da sua revenda!");
    }catch(error){
      toast.error(error instanceof Error?error.message:
        "Não foi possível enviar ao Telegram cadastrado.");
    }finally{setTelegramSending(false);}
  }
  function exportPoster(index:number,mode:"download"|"telegram"){
    const file=readyFile(index);
    if(!file){
      if(prepareErrors[index]){void retryExport(index);return;}
      toast.info("Preparando a arte completa em PNG. O botão ficará pronto automaticamente.");
      return;
    }
    if(mode==="telegram"){
      void sendImageToMyTelegram(file);
      return;
    }
    const isAppleMobile=/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
    if(isAppleMobile){
      downloadBlob(file);
      showImage(file,index);
      toast.info("PNG enviado para Downloads. Você também pode salvar em Fotos pela imagem.");
    }else{
      downloadBlob(file);
      toast.success("PNG pronto para salvar.");
    }
  }

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold tracking-[.18em] text-blue-400"><Trophy size={17}/> STREAM MONITOR</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Eventos de hoje · Artes automáticas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Até 4 confrontos por arte, apenas das principais competições do dia. Escudos reais aparecem quando disponíveis.</p>
      </div>
      <Button type="button" variant="outline" disabled={games.isFetching} onClick={()=>{setDay(today());void games.refetch()}}>
        <RefreshCw size={16} className={games.isFetching?"mr-2 animate-spin":"mr-2"}/> Atualizar eventos
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3" aria-label="Personalizar cor da arte">
      <span className="text-sm font-semibold">Cor do banner</span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cores disponíveis">
        {FOOTBALL_POSTER_PALETTES.map(option=><button
          key={option.id} type="button" title={option.label} aria-label={option.label}
          aria-pressed={accent.toLowerCase()===option.hex.toLowerCase()}
          onClick={()=>chooseColor(option.hex)}
          className={"h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 "+
            (accent.toLowerCase()===option.hex.toLowerCase()?"border-white ring-2 ring-blue-400":"border-white/30")}
          style={{backgroundColor:option.hex}}
        />)}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Personalizada
        <input type="color" className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label="Escolher cor personalizada" value={accent} onChange={event=>chooseColor(event.target.value)}/>
      </label>
      <span className="text-xs text-muted-foreground">A cor também será usada no PNG.</span>
    </div>
    {games.isPending&&<Card className="p-8 text-center">Consultando jogos de hoje…</Card>}
    {games.isError&&<Card className="p-8 text-center text-destructive" role="alert">
      {games.error instanceof Error?games.error.message:"Não foi possível consultar os jogos de hoje."}
    </Card>}
    {games.isSuccess&&groups.length===0&&<Card className="p-8 text-center">Nenhuma partida das principais competições encontrada na FTWB para a data selecionada.</Card>}
    {games.isSuccess&&groups.length>0&&<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {groups.map((group,index)=><Card className="min-w-0 overflow-hidden p-3 sm:p-4"
        key={group.map(m=>m.id).join("|")}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <strong className="text-base">Arte {index+1} de {groups.length}</strong>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={retrying!==null} onClick={()=>exportPoster(index,"download")}>
              <Download size={16} className="mr-2"/>{readyFile(index)?"Baixar PNG":prepareErrors[index]?"Tentar gerar PNG":"Preparando PNG…"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={retrying!==null||telegramSending}
              onClick={()=>exportPoster(index,"telegram")}>
              <Send size={16} className="mr-2"/>{telegramSending?"Enviando ao Telegram…":readyFile(index)?"Enviar ao meu Telegram":prepareErrors[index]?"Tentar gerar PNG":"Preparando PNG…"}
            </Button>
          </div>
        </div>
        {prepareErrors[index]&&<p role="alert" className="mb-2 text-sm text-amber-400">
          Não foi possível preparar o PNG: {prepareErrors[index]} Toque em “Tentar gerar PNG”.
        </p>}
        <ResponsivePoster>{renderArtwork(group)}</ResponsivePoster>
      </Card>)}
    </div>}
    {/* A dedicated, unscaled copy at 1080×1080 for downloads; never inside a clipped card. */}
    {groups.length>0&&<div data-testid="football-export-stage" aria-hidden="true"
      style={{position:"fixed",left:-1800,top:0,width:baseSize,pointerEvents:"none",zIndex:-100}}>
      {groups.map((group,index)=><div key={group.map(m=>m.id).join("|")}
        ref={el=>{exportRefs.current[index]=el}}
        style={{width:baseSize,height:baseSize,overflow:"hidden"}}>
        {renderArtwork(group)}
      </div>)}
    </div>}
    {imagePreview&&<div role="dialog" aria-modal="true" aria-label="Salvar ou compartilhar arte de futebol"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={closeImage}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-4 shadow-2xl"
        onClick={event=>event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <strong className="flex items-center gap-2 text-base"><ImageIcon size={19}/> Arte {imagePreview.index+1} em PNG</strong>
          <Button type="button" size="icon" variant="ghost" onClick={closeImage} aria-label="Fechar imagem">
            <X size={18}/>
          </Button>
        </div>
        <img src={imagePreview.url} alt="Prévia final da arte para salvar"
          className="aspect-square w-full rounded-lg object-contain"/>
        <p className="text-sm text-muted-foreground">
          No iPhone, toque e segure para salvar em Fotos. “Enviar ao meu Telegram” encaminha a imagem para o Telegram cadastrado na sua revenda.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            href={imagePreview.url} download={imagePreview.name} target="_blank" rel="noopener">
            <Download size={16}/> Salvar PNG
          </a>
          <Button type="button" variant="outline" disabled={telegramSending}
            onClick={()=>void sendImageToMyTelegram(imagePreview.file)}>
            <Send size={16} className="mr-2"/>
            {telegramSending?"Enviando…":"Enviar ao meu Telegram"}
          </Button>
          <Button type="button" variant="outline" onClick={closeImage}>Fechar</Button>
        </div>
      </div>
    </div>}
  </main>;
}
