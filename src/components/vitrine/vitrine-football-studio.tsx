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

const today = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
type Branding = { name: string; logo: string; contact: string; accent: string };
const fallbackBrand: Branding = {name:"Stream Monitor",logo:"/favicon.ico",contact:"",accent:"#146df2"};
const baseSize = 1080;
/** Measure the actual artwork card rather than the entire dashboard width. */
function ResponsivePoster({children,onPosterRef}:{
  children:ReactNode; onPosterRef:(element:HTMLDivElement|null)=>void;
}) {
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
      <div ref={onPosterRef} style={{width:baseSize,height:baseSize}}>{children}</div>
    </div>
  </div>;
}
const safeColor = (input: string | undefined) => /^#[0-9a-f]{6}$/i.test(input||"") ? input! : "#146df2";

/** Automated posters: four fixtures (eight clubs) per artwork, with automatic pagination. */
export function VitrineFootballStudio() {
  const load = useServerFn(getVitrineFootballMatches);
  const [brand, setBrand] = useState<Branding>(fallbackBrand);
  const [transparentLogo, setTransparentLogo] = useState(fallbackBrand.logo);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [colorStorageKey, setColorStorageKey] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [action, setAction] = useState<"download"|"telegram"|null>(null);
  const [imagePreview, setImagePreview] = useState<{url:string;name:string;index:number;file:File}|null>(null);
  const imagePreviewUrl = useRef<string|null>(null);
  const posterRefs = useRef<(HTMLDivElement | null)[]>([]);
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
  const haveChannels = (match:FootballMatch) => (match.broadcasts||[]).slice(0,3).join(" • ") || "Sem transmissão";


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
    const images=[...node.querySelectorAll("img")];
    await Promise.all(images.map(img=>
      Promise.race([
        img.decode ? img.decode().catch(()=>{}) : Promise.resolve(),
        new Promise<void>(resolve=>setTimeout(resolve,4000))
      ])
    ));
  }
  async function createPngFile(index:number):Promise<{file:File;degraded:boolean}>{
    const node=posterRefs.current[index];
    if(!node)throw new Error("Arte ainda não carregada.");
    await awaitAssets(node);
    const options={
      width:baseSize,height:baseSize,pixelRatio:1,backgroundColor:"#071227",
      cacheBust:true,skipAutoScale:true
    };
    let blob:Blob|null=null;
    let degraded=false;
    try{
      blob=await toBlob(node,options);
      if(!blob||blob.size<1000)throw new Error("PNG vazio");
    }catch{
      // Some third-party crests block canvas export via CORS. Export the poster
      // rather than failing completely; only unsupported remote images are omitted.
      degraded=true;
      const safer={
        ...options,skipFonts:true,
        filter:(element:HTMLElement)=>{
          if(element instanceof HTMLImageElement && /^https?:/i.test(element.src))return false;
          return true;
        }
      };
      try{
        blob=await toBlob(node,safer);
        if(!blob||blob.size<1000)throw new Error("PNG vazio");
      }catch{
        const png=await toPng(node,safer);
        blob=await (await fetch(png)).blob();
      }
    }
    if(!blob||blob.size<1000)throw new Error("Não foi possível gerar o arquivo PNG.");
    const name="stream-monitor-futebol-"+day+"-arte-"+(index+1)+".png";
    return {file:new File([blob],name,{type:"image/png"}),degraded};
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
  async function exportPoster(index:number,mode:"download"|"telegram"){
    if(saving!==null)return;
    setSaving(index);
    setAction(mode);
    try{
      const {file,degraded}=await createPngFile(index);
      if(degraded)toast.warning("Algumas imagens externas não permitiram exportação e foram ocultadas no PNG.");
      let canShare=typeof navigator.share==="function";
      try{
        if(canShare&&typeof navigator.canShare==="function")canShare=navigator.canShare({files:[file]});
      }catch{canShare=false;}
      const isAppleMobile=/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
      if(mode==="telegram" || isAppleMobile){
        if(canShare){
          try{
            await navigator.share({
              files:[file],
              title:"Eventos de hoje · Stream Monitor",
              text:"🏆 Eventos de hoje! Confira os confrontos e as transmissões. "+brand.name
            });
            return;
          }catch(error){
            if(error instanceof DOMException && error.name==="AbortError")return;
          }
        }
        showImage(file,index);
        toast.info(mode==="telegram"?
          "Abra ou salve o PNG e compartilhe no Telegram.":
          "Toque e segure a imagem para salvá-la no iPhone.");
        return;
      }
      downloadBlob(file);
      toast.success("PNG preparado para download.");
    }catch(error){
      toast.error(error instanceof Error?error.message:
        "Não foi possível preparar o PNG. Tente novamente.");
    }finally{
      setSaving(null);
      setAction(null);
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
      {groups.map((group,index)=>{
        const featured=group.find(match=>!!match.playerPhoto && validatedPhotos[match.playerPhoto]===true);
        const badgeImages:Record<string,string>={};
        for(const match of group) {
          if(match.homeBadge)badgeImages[match.homeBadge]=match.homeBadge;
          if(match.awayBadge)badgeImages[match.awayBadge]=match.awayBadge;
        }
        const channels=Object.fromEntries(group.map(match=>[match.id,haveChannels(match)]));
        return <Card className="min-w-0 overflow-hidden p-3 sm:p-4" key={group.map(m=>m.id).join("|")}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <strong className="text-base">Arte {index+1} de {groups.length}</strong>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={saving!==null} onClick={()=>void exportPoster(index,"download")}>
                <Download size={16} className="mr-2"/>{saving===index&&action==="download"?"Preparando…":"Baixar PNG"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={saving!==null}
                onClick={()=>void exportPoster(index,"telegram")}>
                <Send size={16} className="mr-2"/>{saving===index&&action==="telegram"?"Preparando…":"Enviar ao Telegram"}
              </Button>
            </div>
          </div>
          <ResponsivePoster onPosterRef={el=>{posterRefs.current[index]=el}}>
            <FootballSchedulePoster kind="today" format="feed" matches={group} day={day}
              headline="EVENTOS DE HOJE" brand={brand.name} logo={transparentLogo} contact={brand.contact}
              badgeImages={badgeImages} broadcastByMatch={channels}
              playerPhoto={featured?.playerPhoto||""} playerName={featured?.playerName||""}
              stadium="" accent={accent}/>
          </ResponsivePoster>
        </Card>;
      })}
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
          No iPhone, toque e segure a imagem para salvar em Fotos. Depois, compartilhe pelo Telegram.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            href={imagePreview.url} download={imagePreview.name} target="_blank" rel="noopener">
            <Download size={16}/> Salvar PNG
          </a>
          <Button type="button" variant="outline" onClick={()=>{
            if(typeof navigator.share!=="function"){
              toast.info("Salve o PNG e abra a imagem pelo Telegram.");
              return;
            }
            try{
              void navigator.share({
                files:[imagePreview.file],
                title:"Eventos de hoje · Stream Monitor",
                text:"🏆 Eventos de hoje! Confira os confrontos e transmissões. "+brand.name,
              }).then(closeImage).catch(error=>{
                if(!(error instanceof DOMException&&error.name==="AbortError"))
                  toast.info("Salve o PNG e compartilhe pelo Telegram.");
              });
            }catch{
              toast.info("Salve o PNG e compartilhe pelo Telegram.");
            }
          }}><Send size={16} className="mr-2"/> Compartilhar / Telegram</Button>
          <Button type="button" variant="outline" onClick={closeImage}>Fechar</Button>
        </div>
      </div>
    </div>}
  </main>;
}
