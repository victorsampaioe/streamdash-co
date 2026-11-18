import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { prepareTransparentLogo } from "@/lib/vitrine-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, RefreshCw, Trophy, Send } from "lucide-react";
import { FOOTBALL_POSTER_PALETTES } from "@/components/vitrine/football-schedule-poster";
import { getVitrineFootballMatches, type FootballMatch } from "@/lib/vitrine-football.functions";
import { getVitrineFootballExportImages } from "@/lib/vitrine-football-export.functions";
import { drawFootballPngFallback } from "@/lib/vitrine-football-canvas-fallback";
import { nationalTeamFlagFallback } from "@/lib/vitrine-football-ptbr";
import { offlineFootballFlag } from "@/lib/vitrine-football-offline-flags";
import { resolveMatchesWithAvailableBadges } from "@/lib/vitrine-football-verified-badges";
import { isVerifiedFinishedFootballMatch,parseFootballFinalScore } from "@/lib/vitrine-football-results";
import { footballTeamNamePtBR } from "@/lib/vitrine-football-ptbr";
import { sendVitrineFootballToRegisteredTelegram } from "@/lib/vitrine-football-telegram.functions";

const today = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
type Branding = { name: string; logo: string; contact: string; accent: string };
const fallbackBrand: Branding = {name:"Stream Monitor",logo:"/favicon.ico",contact:"",accent:"#146df2"};
/** Keep crest data URLs small, to avoid Safari's large SVG/foreignObject memory limit. */
async function compactCrest(input:string):Promise<string>{
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const scale=Math.min(1,192/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const context=canvas.getContext("2d");
        if(!context)return resolve(input);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        const compact=canvas.toDataURL("image/png");
        canvas.width=canvas.height=0;
        resolve(compact.length>30?compact:input);
      }catch{resolve(input)}
    };
    image.onerror=()=>resolve(input);
    image.src=input;
  });
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
  const [preparedExports,setPreparedExports]=useState<Record<number,{signature:string;file:File;previewUrl:string}>>({});
  const [prepareErrors,setPrepareErrors]=useState<Record<number,string>>({});
  const [retrying,setRetrying]=useState<number|null>(null);
  const [telegramSending,setTelegramSending]=useState(false);
  const previewUrls=useRef<string[]>([]);
  useEffect(()=>()=>{for(const url of previewUrls.current)URL.revokeObjectURL(url);},[]);
  const [day, setDay] = useState(today);
  const [posterMode,setPosterMode]=useState<"today"|"finished">("today");
  const [todayLayout,setTodayLayout]=useState<"classic"|"grid">("classic");
  const [selectedFinalId,setSelectedFinalId]=useState("");

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

  // Preserve loaded games while navigating; confirmed channels persist on the server.
  const manualTransmissionRefresh=useRef(false);
  const games = useQuery({
    queryKey:["vitrine-football-ftwb",day],
    queryFn:()=>{
      const refreshTransmissions=manualTransmissionRefresh.current;
      manualTransmissionRefresh.current=false;
      return load({data:{date:day,refreshTransmissions}});
    },
    staleTime:posterMode==="finished"?20_000:45*60_000,
    refetchOnMount:false,
    refetchOnWindowFocus:false,
    refetchInterval:posterMode==="finished"&&day===today()?60_000:false,
    refetchIntervalInBackground:false,
    retry:1,
  });
  const finishedMatches=useMemo(()=>(games.data?.matches??[])
    .filter(isVerifiedFinishedFootballMatch),[games.data]);
  const selectedFinal=useMemo(()=>finishedMatches.find(match=>
    [match.home,match.away,match.day].join("|")===selectedFinalId
  )||null,[finishedMatches,selectedFinalId]);
  // Preserve all verified FTWB fixtures, even if an image host cannot
  // serve the real crest. The PNG renders a neutral initials badge instead.
  const sourceMatches=useMemo(()=>posterMode==="finished"
    ?(selectedFinal?[selectedFinal]:[])
    :(games.data?.matches??[]),[games.data,posterMode,selectedFinal]);
  const [validatedPhotos,setValidatedPhotos]=useState<Record<string,boolean>>({});
  useEffect(()=>{
    let mounted=true;
    const urls=[...new Set(sourceMatches.map(match=>match.playerPhoto).filter((url):url is string=>!!url))].slice(0,32);
    for(const url of urls){
      const image=new Image();
      image.crossOrigin="anonymous";
      image.onload=()=>{if(mounted)setValidatedPhotos(prev=>({...prev,[url]:true}))};
      image.onerror=()=>{if(mounted)setValidatedPhotos(prev=>({...prev,[url]:false}))};
      image.src=url;
    }
    return ()=>{mounted=false};
  },[sourceMatches]);
  // Preload the same vetted crest bytes for the on-screen preview AND PNG.
  // Previously, only the hidden export copy was inlined, so browser/CORS errors
  // could silently hide shields from the visible cards or exported image.
  // Local circular flags cover national fixtures without making slow,
  // failure-prone network requests (particularly on Safari). Proxy only the
  // emblems which are not already bundled for the selected match.
  const crestUrls=useMemo(()=>[...new Set(sourceMatches.flatMap(match=>{
    const choices=[
      [match.homeBadge,nationalTeamFlagFallback(match.home,match.league)],
      [match.awayBadge,nationalTeamFlagFallback(match.away,match.league)],
    ];
    return choices.flatMap(([source,flag])=>{
      const code=flag?.match(/\/([\w-]+)\.png$/)?.[1]||"";
      if(offlineFootballFlag(code))return [] as string[];
      return [source,flag];
    });
  }).filter((url):url is string=>!!url&&/^https:\/\//i.test(url)))],[sourceMatches]);
  // Server authorizes the official crest URLs returned for THIS fixture date.
  // There is no fixed team list or overall badge limit, only per-call batches.
  const crestProofs:Record<string,string>=games.data?.crestProofs||{};
  const crestKey=JSON.stringify({crestUrls,day,crestProofs});
  const [crestMedia,setCrestMedia]=useState<{
    key:string;ready:boolean;images:Record<string,string>;unavailable:string[]
  }>({key:"[]",ready:true,images:{},unavailable:[]});
  const inlineAssetsRef=useRef(inlineAssets);
  inlineAssetsRef.current=inlineAssets;
  useEffect(()=>{
    let cancelled=false;
    if(!crestUrls.length){
      setCrestMedia({key:crestKey,ready:true,images:{},unavailable:[]});
      return ()=>{cancelled=true};
    }
    setCrestMedia({key:crestKey,ready:false,images:{},unavailable:[]});
    void (async()=>{
      const chunks:string[][]=[];
      for(let i=0;i<crestUrls.length;i+=16)chunks.push(crestUrls.slice(i,i+16));
      // Load ONLY today's teams, three small 16-image requests at a time.
      // Never truncate the league list and never run an unbounded burst of
      // CDN downloads that can overwhelm iPhones or the fixture provider.
      const received:Record<string,string>={};
      for(let i=0;i<chunks.length&&!cancelled;i+=3){
        const results=await Promise.allSettled(chunks.slice(i,i+3).map(urls=>
          inlineAssetsRef.current({data:{
            urls,date:day,
            crestProofs:Object.fromEntries(urls.filter(url=>crestProofs[url])
              .map(url=>[url,crestProofs[url]])),
          }})
        ));
        for(const result of results){
          if(result.status==="fulfilled")Object.assign(received,result.value.images||{});
        }
      }
      if(cancelled)return;
      // Rasterise on the client only after the authenticated server has vetted
      // the URL and inlined its image. No cross-origin drawing or unknown hosts.
      const images:Record<string,string>={};
      await Promise.all(Object.entries(received).map(async([url,data])=>{
        images[url]=await compactCrest(data);
      }));
      if(cancelled)return;
      setCrestMedia({key:crestKey,ready:true,images,
        unavailable:crestUrls.filter(url=>!images[url])});
    })();
    return ()=>{cancelled=true};
  },[crestKey]);
  const crestsReady=crestMedia.key===crestKey&&crestMedia.ready;
  const selectedBadges=useMemo(()=>crestsReady
    ?resolveMatchesWithAvailableBadges(sourceMatches,crestMedia.images)
    :{visible:[] as FootballMatch[],missingImages:0,matchesWithMissingImages:0},
    [sourceMatches,crestsReady,crestMedia.images]);
  const groups=useMemo(()=>{
    if(posterMode==="finished")return selectedFinal&&selectedBadges.visible.length?[selectedBadges.visible]:[];
    const chunkSize=todayLayout==="grid"?10:4;
    const chunks:FootballMatch[][]=[];
    for(let i=0;i<selectedBadges.visible.length;i+=chunkSize)
      chunks.push(selectedBadges.visible.slice(i,i+chunkSize));
    return chunks;
  },[posterMode,selectedFinal,todayLayout,selectedBadges.visible]);
  const exportSignature=useMemo(()=>JSON.stringify({
    day,posterMode,todayLayout,accent,brand,transparentLogo,groups,validatedPhotos,
    crestKey,crestsReady,crestImages:crestMedia.images
  }),[day,posterMode,accent,brand,transparentLogo,groups,validatedPhotos,
    crestKey,crestsReady,crestMedia.images,todayLayout]);
  // A single native 2160×2700 render produces the preview AND the exact same
  // PNG used for downloads and the registered Telegram. No DOM screenshots.
  const savePreviewFile=(index:number,file:File,signature:string)=>{
    const previewUrl=URL.createObjectURL(file);
    previewUrls.current.push(previewUrl);
    setPreparedExports(prev=>({...prev,[index]:{signature,file,previewUrl}}));
  };
  async function createPngFile(index:number):Promise<{file:File}>{
    const group=groups[index];
    if(!group?.length)throw new Error("Nenhum jogo disponível para esta arte.");
    if(!crestsReady)throw new Error("Ainda carregando escudos das equipes.");
    // Group already contains only resolved real emblems; do not replace them
    // with arbitrary country flags or initials at PNG time.
    const matches=group;
    const featured=group.find(match=>!!match.playerPhoto&&validatedPhotos[match.playerPhoto]===true);
    const trustedAsset=async(src:string,label:string)=>{
      if(!/^https:\/\//i.test(src))return src;
      const result=await inlineAssetsRef.current({data:{urls:[src]}});
      if(result.images?.[src])return result.images[src];
      // Canvas can still load image if the origin permits CORS; otherwise
      // the renderer raises an error instead of returning an incomplete PNG.
      console.warn("[vitrine-futebol] Própria fonte não autorizou proxy:",label);
      return src;
    };
    const [logo,playerPhoto]=await Promise.all([
      trustedAsset(transparentLogo,"logo da revenda"),
      featured?.playerPhoto?trustedAsset(featured.playerPhoto,"jogador"):Promise.resolve("")
    ]);
    const filename=posterMode==="finished"
      ?"stream-monitor-fim-de-jogo-"+day+"-"+(index+1)+"-2160x2700.png"
      :todayLayout==="grid"
      ?"stream-monitor-jogos-em-grade-"+day+"-arte-"+(index+1)+"-2160x2700.png"
      :"stream-monitor-futebol-"+day+"-arte-"+(index+1)+"-2160x2700.png";
    try{
      const file=await drawFootballPngFallback({
        matches,day,accent,logo,contact:brand.contact,
        name:brand.name,filename,playerPhoto,
        kind:posterMode==="today"&&todayLayout==="grid"?"grid":posterMode,
      });
      return {file};
    }catch(error){
      console.error("[vitrine-futebol] export arte "+(index+1),error);
      throw new Error("Arte "+(index+1)+": "+
        (error instanceof Error?error.message:"Não foi possível gerar o PNG."));
    }
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
    // Revoke previous previews before preparing a new day, color or reseller.
    for(const url of previewUrls.current)URL.revokeObjectURL(url);
    previewUrls.current=[];
    setPreparedExports({});
    setPrepareErrors({});
    if(!crestsReady)return ()=>{cancelled=true};
    const handle=window.setTimeout(()=>{
      void (async()=>{
        for(let i=0;i<groups.length&&!cancelled;i++){
          try{
            const {file}=await createPngFile(i);
            if(!cancelled)savePreviewFile(i,file,exportSignature);
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
    if(!crestsReady){toast.info("Preparando escudos dos times para a arte.");return;}
    if(retrying!==null)return;
    setRetrying(index);
    setPrepareErrors(prev=>{const next={...prev};delete next[index];return next});
    try{
      const {file}=await createPngFile(index);
      savePreviewFile(index,file,exportSignature);
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
      if(file.size>18*1024*1024){
        throw new Error("Este PNG excede o limite de 18 MB para envio pelo bot.");
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
      const result=await sendRegisteredTelegram({data:{pngDataUrl,date:day,posterKind:posterMode}});
      if(!result?.ok)throw new Error("Telegram não confirmou o recebimento.");
      toast.success("Banner enviado ao Telegram cadastrado da sua revenda!");
    }catch(error){
      toast.error(error instanceof Error?error.message:
        "Não foi possível enviar ao Telegram cadastrado.");
    }finally{setTelegramSending(false);}
  }
  function exportPoster(index:number,mode:"download"|"telegram"){
    if(!crestsReady){toast.info("Carregando escudos dos times. A exportação ficará pronta automaticamente.");return;}
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
    // Same file-download flow as Vitrine Banner on all devices.
    // Don't open a separate full-screen browser preview on iPhone.
    downloadBlob(file);
    toast.success("Banner completo salvo em PNG.");
  }

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold tracking-[.18em] text-blue-400"><Trophy size={17}/> STREAM MONITOR</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{posterMode==="finished"
          ?"Fim de jogo · Placar final":"Eventos de hoje · Artes automáticas"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{posterMode==="finished"
          ?"Selecione uma partida encerrada com placar confirmado pela FTWB. A arte inclui os dois times, resultado, sua logo e WhatsApp."
          :todayLayout==="grid"
            ?"Modelo Grade de Jogos: até 10 partidas por arte em duas colunas fixas, escudos, horários, transmissões, logo e WhatsApp. PNG em 2160 × 2700."
            :"Modelo Clássico: até 4 confrontos por arte, com identidade Stream Monitor. PNG em 2160 × 2700."}</p>
        {!crestsReady&&sourceMatches.length>0&&<p className="mt-1 text-xs text-blue-300" role="status">Validando escudos reais dos dois times antes de montar as artes…</p>}
        {crestsReady&&selectedBadges.matchesWithMissingImages>0&&
          <p className="mt-1 text-xs text-amber-400" role="status">
            {selectedBadges.visible.length} partida(s) encontrada(s). Em {selectedBadges.matchesWithMissingImages} partida(s), algum escudo oficial não pôde ser carregado; os jogos continuam disponíveis com a sigla do time no lugar da imagem ausente. Nenhum escudo é inventado.
          </p>}
      </div>
      <Button type="button" variant="outline" disabled={games.isFetching}
        onClick={()=>{
          manualTransmissionRefresh.current=true;
          const currentDate=today();
          if(posterMode==="today"&&day!==currentDate){setDay(currentDate);return;}
          void games.refetch();
        }}>
        <RefreshCw size={16} className={games.isFetching?"mr-2 animate-spin":"mr-2"}/>
        {posterMode==="finished"?"Atualizar resultados":"Atualizar eventos"}
      </Button>
    </div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de arte de futebol">
      <Button type="button" role="tab" aria-selected={posterMode==="today"}
        variant={posterMode==="today"?"default":"outline"}
        onClick={()=>{setPosterMode("today");setDay(today());setSelectedFinalId("");}}>
        ⚽ Jogos de hoje
      </Button>
      <Button type="button" role="tab" aria-selected={posterMode==="finished"}
        variant={posterMode==="finished"?"default":"outline"}
        onClick={()=>{setPosterMode("finished");setDay(today());setSelectedFinalId("");}}>
        🏆 Fim de jogo
      </Button>
    </div>
    {posterMode==="today"&&<Card className="space-y-3 p-4" aria-label="Modelo do banner de jogos do dia">
      <strong className="text-sm">Escolha o modelo dos jogos do dia</strong>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Modelos disponíveis">
        <button type="button" aria-pressed={todayLayout==="classic"}
          onClick={()=>setTodayLayout("classic")}
          className={"rounded-xl border p-3 text-left transition-colors "+
            (todayLayout==="classic"?"border-blue-400 bg-blue-500/15":"border-border hover:border-blue-400/50")}>
          <span className="block text-sm font-bold">Modelo 1 · Clássico</span>
          <span className="mt-1 block text-xs text-muted-foreground">Até 4 jogos por arte, no estilo original aprovado.</span>
        </button>
        <button type="button" aria-pressed={todayLayout==="grid"}
          onClick={()=>setTodayLayout("grid")}
          className={"rounded-xl border p-3 text-left transition-colors "+
            (todayLayout==="grid"?"border-blue-400 bg-blue-500/15":"border-border hover:border-blue-400/50")}>
          <span className="block text-sm font-bold">Modelo 2 · Grade de Jogos</span>
          <span className="mt-1 block text-xs text-muted-foreground">Até 10 jogos em duas colunas, sem alterar o tamanho dos cartões.</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Os dois modelos usam os jogos reais, a cor escolhida abaixo e a marca da sua revenda.
        Ao mudar de modelo ou cor, a prévia e o PNG são gerados novamente.
      </p>
    </Card>}
    {posterMode==="finished"&&<Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-base">Escolha uma partida finalizada</strong>
        <span className="text-xs text-muted-foreground">
          Jogos de hoje são atualizados automaticamente a cada minuto enquanto esta página estiver aberta
        </span>
      </div>
      <label className="block max-w-xs text-xs font-semibold text-muted-foreground">
        Data da partida
        <input type="date" value={day} max={today()}
          onChange={event=>{setSelectedFinalId("");setDay(event.target.value||today());}}
          className="mt-1 block w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground"/>
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        Jogos com resultado oficial
        <select value={selectedFinalId} disabled={!finishedMatches.length}
          onChange={event=>setSelectedFinalId(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground">
          <option value="">Selecione o jogo encerrado…</option>
          {finishedMatches.map(match=>{
            const value=[match.home,match.away,match.day].join("|");
            return <option key={value} value={value}>
              {footballTeamNamePtBR(match.home)} {match.scoreLabel} {footballTeamNamePtBR(match.away)} — {match.league}
            </option>;
          })}
        </select>
      </label>
      {!finishedMatches.length&&games.isSuccess&&<p className="text-sm text-amber-400">
        Ainda não há partidas encerradas com placar confirmado nesta data. Os resultados ficam disponíveis
        quando a FTWB confirmar o fim do jogo e informar os dois placares.
      </p>}
      {selectedFinal&&<p className="text-sm text-emerald-400">
        Resultado confirmado: <strong>{footballTeamNamePtBR(selectedFinal.home)} {parseFootballFinalScore(selectedFinal.scoreLabel)?.label} {footballTeamNamePtBR(selectedFinal.away)}</strong>.
        A arte usará este placar sem alterações.
      </p>}
    </Card>}
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
    {games.isSuccess&&crestsReady&&posterMode==="today"&&groups.length===0&&<Card className="p-8 text-center">
      A fonte de jogos não retornou partidas das competições selecionadas para esta data. Toque em “Atualizar eventos” para consultar novamente.
    </Card>}
    {games.isSuccess&&posterMode==="finished"&&finishedMatches.length>0&&!selectedFinal&&
      <Card className="p-8 text-center text-muted-foreground">
        Escolha um dos jogos finalizados acima para gerar o novo banner Fim de Jogo.
      </Card>}
    {games.isSuccess&&groups.length>0&&<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {groups.map((group,index)=><Card className="min-w-0 overflow-hidden p-3 sm:p-4"
        key={group.map(m=>m.id).join("|")}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <strong className="text-base">{posterMode==="finished"?"🏆 Fim de Jogo · Resultado final":todayLayout==="grid"?`Modelo 2 · Grade de Jogos · Arte ${index+1} de ${groups.length}`:`Modelo 1 · Clássico · Arte ${index+1} de ${groups.length}`}</strong>
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
        {readyFile(index)&&preparedExports[index]?.previewUrl?
          <img src={preparedExports[index].previewUrl}
            alt={"Prévia exata da Arte "+(index+1)+" — PNG 2160 × 2700"}
            data-testid="football-png-preview"
            className="mx-auto block h-auto w-full max-w-[550px] rounded-xl"
            style={{aspectRatio:"4 / 5",objectFit:"contain"}}/>
          :<div className="mx-auto flex w-full max-w-[550px] items-center justify-center rounded-xl bg-slate-950/80 px-5 text-center text-sm text-slate-300"
              style={{aspectRatio:"4 / 5"}}>
              {prepareErrors[index]?"Não foi possível preparar a prévia. Verifique o erro acima e tente novamente.":"Gerando a mesma imagem de alta resolução usada no download e no Telegram…"}
            </div>}
      </Card>)}
    </div>}
  </main>;
}
