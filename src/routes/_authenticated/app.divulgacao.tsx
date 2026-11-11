import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { useRef, useState } from "react";
import { getTmdbFeed } from "@/lib/tmdb.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Sparkles, Save, Film, Tv, LayoutTemplate, Share2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/divulgacao")({
  component: VitrineIA,
  head: () => ({ meta: [{ title: "Vitrine IA | Stream Monitor" }] }),
});

type MediaItem = { tmdb_id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null; release_date: string | null; found_count?: number };
type Brand = { brand_name: string; logo_url: string; whatsapp: string; primary_color: string };
type Format = "feed" | "story" | "landscape";
type Template = "four" | "featured" | "series" | "grid";
const defaultBrand: Brand = { brand_name: "Minha Revenda", logo_url: "", whatsapp: "", primary_color: "#2563eb" };
const sizes: Record<Format, { w: number; h: number; label: string }> = {
  feed: { w: 1080, h: 1080, label: "Feed 1080×1080" },
  story: { w: 1080, h: 1920, label: "Story 1080×1920" },
  landscape: { w: 1200, h: 450, label: "Paisagem 1200×450" },
};
const templates: { id: Template; name: string; count: number }[] = [
  { id: "four", name: "Carrossel de 4 capas", count: 4 },
  { id: "featured", name: "1 título em destaque", count: 1 },
  { id: "series", name: "1 série em destaque", count: 1 },
  { id: "grid", name: "Grid de 6 capas", count: 6 },
];
const poster = (path: string | null) => path ? `https://image.tmdb.org/t/p/w500${path}` : "";
const sanitize = (value: string) => value.replace(/[^\d]/g, "").slice(0, 13);

function VitrineIA() {
  const runFeed = useServerFn(getTmdbFeed);
  const qc = useQueryClient();
  const artRef = useRef<HTMLDivElement>(null);
  const [brand, setBrand] = useState<Brand>(defaultBrand);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<Format>("feed");
  const [template, setTemplate] = useState<Template>("four");
  const [kind, setKind] = useState<"movie" | "tv">("movie");
  const [selected, setSelected] = useState<number[]>([]);
  const [headline, setHeadline] = useState("Novidades para você");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [logoUpload, setLogoUpload] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#081224");
  const [textColor, setTextColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#bfdbfe");
  const [hideStudioMark, setHideStudioMark] = useState(true);
  const [sharing, setSharing] = useState(false);

  const settings = useQuery({
    queryKey: ["vitrine-brand"], queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Faça login para usar a Vitrine IA.");
      const { data, error } = await supabase.from("promo_brand_settings" as any)
        .select("brand_name,logo_url,whatsapp,primary_color").eq("owner_id", user.id).maybeSingle();
      if (error) throw error;
      const existing = data as Partial<Brand> | null;
      if (existing) setBrand({
        brand_name: existing.brand_name || defaultBrand.brand_name,
        logo_url: existing.logo_url || "",
        whatsapp: existing.whatsapp || "",
        primary_color: existing.primary_color || defaultBrand.primary_color,
      });
      return user.id;
    }, retry: 1,
  });
  const feed = useQuery({
    queryKey: ["vitrine-feed",kind,search.trim()],
    queryFn: async () => runFeed({ data: { feed: kind === "movie" ? "movie_recent" : "tv_recent", query: search.trim() || undefined } }),
    staleTime: 300000,
  });
  const history = useQuery({
    queryKey:["vitrine-history",settings.data],
    enabled:!!settings.data,
    queryFn:async()=>{
      const {data,error}=await supabase.from("promo_generations" as any)
        .select("id,title,format,storage_path,created_at").eq("owner_id",settings.data!)
        .order("created_at",{ascending:false}).limit(30);
      if(error)throw error;
      return (data??[]) as {id:string;title:string;format:string;storage_path:string|null;created_at:string}[];
    },staleTime:30000
  });
  async function openSaved(path:string|null){
    if(!path)return toast.error("Imagem não armazenada para este registro.");
    const {data,error}=await supabase.storage.from("promo-arts").createSignedUrl(path,120);
    if(error||!data?.signedUrl)return toast.error("Não foi possível abrir a arte.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  const sourceItems = ((feed.data?.items ?? []) as MediaItem[])
    .filter(x => x.poster_path && x.media_type === kind && (!confirmedOnly || (x.found_count ?? 0) > 0))
    .filter((item,index,list)=>list.findIndex(other=>other.tmdb_id===item.tmdb_id && other.media_type===item.media_type)===index).slice(0, 30);
  const chosen = selected.length
    ? selected.map(id => sourceItems.find(x => x.tmdb_id === id)).filter((x): x is MediaItem => !!x)
    : sourceItems.slice(0, templates.find(x=>x.id===template)?.count ?? 4);
  const shown = chosen.slice(0, templates.find(x=>x.id===template)?.count ?? 4);
  const dimensions = sizes[format];
  const year = (s: string | null) => s?.slice(0,4) || "";
  const caption = `🎬 ${headline.trim()}! Confira os destaques com ${brand.brand_name.trim()}.${brand.whatsapp ? ` Fale conosco: ${brand.whatsapp}` : ""} #VitrineIA`;

  function uploadLogo(file?: File) {
    if (!file) return;
    if (!["image/png","image/jpeg","image/webp"].includes(file.type)) return toast.error("Envie uma logo PNG, JPG ou WEBP.");
    if (file.size > 2*1024*1024) return toast.error("A logo deve ter no máximo 2 MB.");
    const reader = new FileReader();
    reader.onload = () => { setLogoUpload(String(reader.result || "")); toast.success("Logo aplicada à arte. Para reutilizá-la futuramente, mantenha também uma URL HTTPS salva."); };
    reader.onerror = () => toast.error("Não foi possível ler a logo.");
    reader.readAsDataURL(file);
  }

  async function makePng() {
    if (!artRef.current || shown.length===0) throw new Error("Escolha pelo menos uma capa.");
    return toPng(artRef.current, {
      width: dimensions.w, height: dimensions.h, pixelRatio:1, cacheBust:true,
      backgroundColor, style: { transform:"none", transformOrigin:"top left" },
    });
  }

  async function shareTelegram() {
    setSharing(true);
    try {
      const src=await makePng();
      const blob=await (await fetch(src)).blob();
      const file=new File([blob], "vitrine-stream-monitor.png", {type:"image/png"});
      if (navigator.canShare?.({ files:[file] }) && navigator.share) {
        await navigator.share({ files:[file], title:headline });
      } else {
        toast.info("O dispositivo não oferece compartilhamento de arquivos. Baixe o PNG e envie pelo Telegram.");
      }
    } catch(error) {
      if (error instanceof Error && error.name==="AbortError") return;
      toast.error("Falha ao compartilhar. Tente baixar o PNG.");
    } finally {setSharing(false);}
  }

  async function saveBrand() {
    setSaving(true);
    try {
      if (!settings.data) throw new Error("Sessão indisponível");
      const payload = {
        owner_id: settings.data, brand_name: brand.brand_name.trim().slice(0,100),
        logo_url: brand.logo_url.trim() || null, whatsapp: sanitize(brand.whatsapp) || null,
        primary_color: brand.primary_color,
        updated_at: new Date().toISOString(),
      };
      if (!payload.brand_name) throw new Error("Informe o nome da sua marca.");
      if (payload.logo_url && !/^https:\/\//i.test(payload.logo_url)) throw new Error("A logo precisa usar HTTPS.");
      const { error } = await supabase.from("promo_brand_settings" as any).upsert(payload);
      if (error) throw error;
      toast.success("Identidade visual salva no Lovable Cloud.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  async function download() {
    if (!artRef.current || !settings.data || shown.length === 0) return;
    setExporting(true);
    try {
      const src = await makePng();
      const image = await (await fetch(src)).blob();
      if(image.size>5*1024*1024)throw new Error("Imagem grande demais para o armazenamento.");
      const path=`${settings.data}/${crypto.randomUUID()}.png`;
      const {error:storageError}=await supabase.storage.from("promo-arts")
        .upload(path,image,{contentType:"image/png",upsert:false});
      if(storageError)throw storageError;
      const { error } = await supabase.from("promo_generations" as any).insert({
        owner_id: settings.data, media_type: kind, template, format,
        title: headline.trim().slice(0,140),
        items: shown.map(x=>({ tmdb_id:x.tmdb_id, media_type:x.media_type, title:x.title })),
        caption,storage_path:path,
      });
      const link = document.createElement("a");
      link.download = `vitrine-${format}-${Date.now()}.png`;
      link.href = src;
      link.click();
      if (error) toast.warning("PNG armazenado, mas não foi possível registrar o histórico.");
      else toast.success("Arte salva no Lovable Cloud e exportada em PNG.");
      qc.invalidateQueries({queryKey:["vitrine-history"]});
    } catch {
      toast.error("Falha ao exportar PNG. Verifique se as imagens permitem exportação e tente novamente.");
    } finally { setExporting(false); }
  }

  return <div className="space-y-5 max-w-7xl mx-auto">
    <Card className="p-6 bg-gradient-to-r from-blue-950/70 to-slate-950/70 border-blue-500/25">
      <div className="flex items-center gap-2 text-blue-300 text-xs uppercase tracking-widest"><Sparkles size={18}/> Stream Monitor Studio</div>
      <h1 className="text-3xl font-extrabold mt-2">Vitrine IA</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">Crie artes personalizadas para sua revenda com capas e metadados reais da TMDB. O catálogo TMDB não comprova disponibilidade em nenhum servidor.</p>
    </Card>
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Identidade da revenda</h2>
          <label className="text-sm block">Nome da marca<Input className="mt-1" maxLength={100} value={brand.brand_name} onChange={e=>setBrand({...brand,brand_name:e.target.value})}/></label>
          <label className="text-sm block">WhatsApp<Input className="mt-1" placeholder="DDD + número" value={brand.whatsapp} onChange={e=>setBrand({...brand,whatsapp:e.target.value})}/></label>
          <label className="text-sm block">URL HTTPS da logo<Input className="mt-1" placeholder="https://..." value={brand.logo_url} onChange={e=>setBrand({...brand,logo_url:e.target.value})}/></label>
          <label className="text-sm block">Enviar logo do dispositivo<input aria-label="Enviar logo" className="mt-1 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadLogo(e.target.files?.[0])}/></label>
          {logoUpload && <div className="flex items-center gap-2 text-xs"><img src={logoUpload} alt="Logo enviada" className="h-10 w-16 object-contain"/><span>Upload aplicado à prévia</span><Button variant="ghost" size="sm" onClick={()=>setLogoUpload("")}>Remover</Button></div>}
          <p className="text-xs text-muted-foreground">O upload funciona nesta edição; para manter a logo entre sessões, salve uma URL HTTPS.</p>
          <div className="grid grid-cols-2 gap-3">
            {([{label:"Cor principal",value:brand.primary_color,change:(v:string)=>setBrand({...brand,primary_color:v})},{label:"Fundo",value:backgroundColor,change:setBackgroundColor},{label:"Texto",value:textColor,change:setTextColor},{label:"Detalhes",value:accentColor,change:setAccentColor}]).map(c=><label key={c.label} className="text-xs flex gap-2 items-center"><input aria-label={c.label} type="color" value={c.value} onChange={e=>c.change(e.target.value)}/>{c.label}</label>)}
          </div>
          <Button onClick={saveBrand} disabled={saving || settings.isLoading} variant="outline" className="w-full"><Save className="h-4 w-4 mr-2"/>Salvar identidade</Button>
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="font-bold flex gap-2 items-center"><LayoutTemplate size={18}/> Configurar arte</h2>
          <label className="text-sm block">Título<Input className="mt-1" maxLength={100} value={headline} onChange={e=>setHeadline(e.target.value)}/></label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={kind==="movie"?"default":"outline"} onClick={()=>{setKind("movie");setSelected([]);}}><Film className="h-4 w-4 mr-2"/>Filmes</Button>
            <Button variant={kind==="tv"?"default":"outline"} onClick={()=>{setKind("tv");setSelected([]);}}><Tv className="h-4 w-4 mr-2"/>Séries</Button>
          </div>
          <label className="text-sm block">Modelo<select className="w-full mt-1 rounded-md border bg-background p-2" value={template} onChange={e=>{setTemplate(e.target.value as Template);setSelected([]);}}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="text-sm block">Pesquisar filme ou série<Input className="mt-1" placeholder="Digite o nome para buscar na TMDB" value={search} onChange={e=>{setSearch(e.target.value);setSelected([]);}}/></label>
          <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={hideStudioMark} onChange={e=>setHideStudioMark(e.target.checked)}/>Ocultar marca Vitrine IA na arte</label>
          <label className="text-sm block">Formato<select className="w-full mt-1 rounded-md border bg-background p-2" value={format} onChange={e=>setFormat(e.target.value as Format)}>{Object.entries(sizes).map(([key,val])=><option value={key} key={key}>{val.label}</option>)}</select></label>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={confirmedOnly} onChange={e=>{setConfirmedOnly(e.target.checked);setSelected([]);}}/>Somente títulos encontrados no catálogo monitorado</label>
          <p className="text-xs text-muted-foreground">Para anunciar “já disponível”, confirme a presença no servidor específico. O filtro de catálogo monitorado não garante que o vídeo reproduza.</p>
          <Button className="w-full" disabled={exporting || shown.length===0 || settings.isLoading} onClick={download}><Download size={17} className="mr-2"/>{exporting?"Gerando imagem...":"Baixar PNG"}</Button>
          <Button variant="outline" className="w-full" disabled={sharing||shown.length===0} onClick={shareTelegram}><Share2 size={17} className="mr-2"/>{sharing?"Preparando...":"Compartilhar PNG (Telegram)"}</Button>
          <Button variant="outline" className="w-full" onClick={()=>{navigator.clipboard.writeText(caption).then(()=>toast.success("Legenda copiada")).catch(()=>toast.error("Não foi possível copiar"));}}>Copiar legenda</Button>
        </Card>
      </div>
      <div className="min-w-0 space-y-4">
        <Card className="p-4 overflow-hidden">
          <p className="font-semibold mb-3">Prévia da sua arte</p>
          <div className="overflow-auto rounded-xl bg-slate-900 p-2" style={{maxHeight:610}}>
            <div style={{width:dimensions.w,height:dimensions.h,zoom:Math.min(1, 540/dimensions.w),margin:"0 auto"}}>
              <div ref={artRef} style={{width:dimensions.w,height:dimensions.h,position:"relative",overflow:"hidden",color:textColor,background:`radial-gradient(ellipse at 80% 10%, ${brand.primary_color} 0%, ${backgroundColor} 64%, ${backgroundColor} 100%)`,fontFamily:"Arial,sans-serif",padding:format==="landscape"?50:70,display:"flex",flexDirection:"column",justifyContent:"space-between",boxSizing:"border-box"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:28}}>
                  <div style={{display:"flex",gap:22,alignItems:"center"}}>
                    {(logoUpload || brand.logo_url) && <img src={logoUpload || brand.logo_url} crossOrigin="anonymous" alt="" style={{height:format==="landscape"?70:94,maxWidth:160,objectFit:"contain"}} />}
                    <span style={{fontWeight:900,fontSize:format==="landscape"?34:55,letterSpacing:-1}}>{brand.brand_name || "Minha Revenda"}</span>
                  </div>
                  {!hideStudioMark && <span style={{fontSize:format==="landscape"?22:28,color:accentColor,textTransform:"uppercase",letterSpacing:3}}>Vitrine IA</span>}
                </div>
                <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",minHeight:0,gap:22,marginTop:format==="landscape"?4:38}}>
                  <div style={{fontWeight:900,fontSize:format==="landscape"?46:format==="story"?100:76,lineHeight:1.06,maxWidth:"100%",overflowWrap:"anywhere"}}>{headline || "Novidades para você"}</div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${shown.length || 1},minmax(0,1fr))`,gap:format==="landscape"?18:22,alignItems:"center"}}>
                    {shown.map((item,i)=><div key={item.tmdb_id} style={{minWidth:0,position:"relative",borderRadius:20,overflow:"hidden",background:"#16243d",boxShadow:"0 14px 30px #0008",border:i===0&&template==="featured"?`5px solid ${brand.primary_color}`:"2px solid #ffffff33"}}>
                      <img crossOrigin="anonymous" src={poster(item.poster_path)} alt={item.title} style={{width:"100%",height:format==="landscape"?185:format==="story"?470:365,objectFit:"cover",display:"block"}}/>
                      <div style={{fontWeight:800,fontSize:format==="landscape"?15:21,padding:"13px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                    </div>)}
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,fontSize:format==="landscape"?25:36,fontWeight:800}}>
                  <span>🎬 Filmes e séries em destaque</span><span>{brand.whatsapp ? `WhatsApp: ${sanitize(brand.whatsapp)}` : "Sua diversão começa aqui"}</span>
                </div>

              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Histórico de artes — Lovable Cloud</h2>
          <p className="text-xs text-muted-foreground">Arquivos privados por revendedor. Links temporários válidos por 2 minutos.</p>
          {history.isLoading && <p className="text-sm">Buscando artes salvas...</p>}
          {history.isError && <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>}
          {!history.isLoading && history.data?.length===0 && <p className="text-sm text-muted-foreground">Nenhuma arte salva até agora.</p>}
          <div className="grid sm:grid-cols-2 gap-2">
            {history.data?.map(item=><div key={item.id} className="rounded-xl border p-3 flex justify-between items-center gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold truncate">{item.title}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.format}</p></div>
              <Button size="sm" variant="outline" disabled={!item.storage_path} onClick={()=>openSaved(item.storage_path)}><Download size={15}/></Button>
            </div>)}
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="font-bold">Escolha as capas {selected.length>0?`(${selected.length})`:"(seleção automática)"}</h2>
          {feed.isLoading && <p className="text-sm text-muted-foreground">Buscando títulos na TMDB...</p>}
          {feed.isError && <p className="text-sm text-destructive">Não foi possível consultar o catálogo: {String(feed.error)}</p>}
          {feed.data && sourceItems.length===0 && <p className="text-sm text-muted-foreground">Nenhum título encontrado para esse filtro.</p>}
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3">
            {sourceItems.map(item=><button type="button" key={item.tmdb_id} title={item.title} onClick={()=>setSelected(old=>old.includes(item.tmdb_id)?old.filter(x=>x!==item.tmdb_id):[...old.slice(-(templates.find(t=>t.id===template)?.count??4)+1),item.tmdb_id])} className={`rounded-xl overflow-hidden text-left border-2 transition-colors ${selected.includes(item.tmdb_id)?"border-blue-500":"border-transparent"}`}>
              <img src={poster(item.poster_path)} alt={item.title} loading="lazy" className="aspect-[2/3] w-full object-cover"/>
              <span className="block text-[11px] font-medium truncate px-1 mt-1">{item.title} {year(item.release_date)}</span>
            </button>)}
          </div>
          <p className="text-xs text-muted-foreground">Selecione até {templates.find(t=>t.id===template)?.count ?? 4} capas. Os créditos, licenças de imagens e disponibilidade de conteúdo devem ser respeitados antes da publicação comercial.</p>
        </Card>
      </div>
    </div>
  </div>;
}
