import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { useEffect, useRef, useState } from "react";
import { getTmdbFeed, getTmdbDetail } from "@/lib/tmdb.functions";
import { prepareTransparentLogo } from "@/lib/vitrine-image";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Sparkles, Save, Film, Tv, LayoutTemplate, Share2 } from "lucide-react";

type MediaItem = { tmdb_id: number; media_type: "movie" | "tv"; title: string; poster_path: string | null; release_date: string | null; overview?: string | null; found_count?: number };
type Brand = { brand_name: string; logo_url: string; whatsapp: string; primary_color: string };
type Format = "feed" | "story" | "landscape";
type Template = "four" | "featured" | "series" | "grid";
type AiStyle = "automatico" | "acao" | "fantasia" | "terror" | "suspense" | "romance" | "drama" | "ficcao" | "animacao" | "documentario";
const aiStyles: { id: AiStyle; label: string }[] = [
  {id:"automatico",label:"Automático · baseado na sinopse"},
  {id:"acao",label:"Ação cinematográfica"},
  {id:"fantasia",label:"Fantasia épica"},
  {id:"terror",label:"Terror atmosférico"},
  {id:"suspense",label:"Suspense"},
  {id:"romance",label:"Romance"},
  {id:"drama",label:"Drama realista"},
  {id:"ficcao",label:"Ficção científica"},
  {id:"animacao",label:"Animação 3D original"},
  {id:"documentario",label:"Documentário"},
];
const aiWorkerUrl = "https://streammonitor-vitrine-ai.victorsampaio133.workers.dev/generate";
const todayFortaleza = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone:"America/Fortaleza", year:"numeric", month:"2-digit", day:"2-digit"
}).format(new Date());
const defaultBrand: Brand = { brand_name: "Minha Revenda", logo_url: "", whatsapp: "", primary_color: "#2563eb" };
const officialLogoUrl = "/__l5e/assets-v1/6c2c6658-faca-42c7-9e11-89b20a23a3dd/logo-official.png";
const adminBrand: Brand = { brand_name: "Stream Monitor", logo_url: "/favicon.ico", whatsapp: "", primary_color: "#2563eb" };
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
async function toEmbeddedImage(url: string): Promise<string> {
  if (url.startsWith("data:image/")) return url;
  const response = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!response.ok) throw new Error(`Imagem indisponível (HTTP ${response.status})`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") && !/\.ico(?:\?|$)/i.test(url)) throw new Error("A URL não retornou uma imagem.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível preparar a imagem."));
    reader.readAsDataURL(blob);
  });
}
const sanitize = (value: string) => value.replace(/[^\d]/g, "").slice(0, 13);
/** Convert local canvas PNG without a fetch request (browser/VPN-safe). */
function pngDataUrlToBlob(src: string): Blob {
  const prefix = "data:image/png;base64,";
  if (!src.startsWith(prefix)) throw new Error("O gerador não retornou um PNG válido.");
  const binary = atob(src.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}
function savePngLocally(image: Blob, filename: string) {
  const url = URL.createObjectURL(image);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function fallbackPoster(title: string): string {
  const safe = title.replace(/[&<>"']/g, "").slice(0, 100);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="#101f38"/><rect x="18" y="18" width="464" height="714" rx="22" fill="none" stroke="#60a5fa" stroke-width="4"/><text x="250" y="360" fill="white" font-size="30" font-family="Arial" text-anchor="middle">STREAM MONITOR</text><text x="250" y="410" fill="#93c5fd" font-size="20" font-family="Arial" text-anchor="middle">Imagem indisponível</text><title>${safe}</title></svg>`);
}

export function VitrineStudio({ mode }: { mode: "ai" | "banner" }) {
  const runFeed = useServerFn(getTmdbFeed);
  const runDetail = useServerFn(getTmdbDetail);
  const qc = useQueryClient();
  const artRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(540);
  const [brand, setBrand] = useState<Brand>(defaultBrand);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<Format>("feed");
  const [template, setTemplate] = useState<Template>("featured");
  const [kind, setKind] = useState<"movie" | "tv">("movie");
  const [selected, setSelected] = useState<number[]>([]);
  const [headline, setHeadline] = useState("Destaque da semana");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const [logoUpload, setLogoUpload] = useState("");
  const [removeBlackLogo, setRemoveBlackLogo] = useState(true);
  const [bannerReady, setBannerReady] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#050e23");
  const [textColor, setTextColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#60a5fa");
  const [hideStudioMark, setHideStudioMark] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [embeddedPosters, setEmbeddedPosters] = useState<Record<string,string>>({});
  const [embeddedLogo, setEmbeddedLogo] = useState("");
  const [imageError, setImageError] = useState("");
  const [imagesLoading, setImagesLoading] = useState(false);
  const [serverNames, setServerNames] = useState("");
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [assetWarning, setAssetWarning] = useState("");
  const [aiStyle, setAiStyle] = useState<AiStyle>("automatico");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiBackground, setAiBackground] = useState("");
  const [grantedArtSignature, setGrantedArtSignature] = useState("");
  const grantedArtRef = useRef("");
  const creditInFlight = useRef<Promise<void> | null>(null);
  const today = todayFortaleza();


  const settings = useQuery({
    queryKey: ["vitrine-brand"], queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Faça login para usar a Vitrine IA.");
      const { data: adminAccess, error: adminError } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      if (adminError) throw adminError;
      const admin = adminAccess === true;
      setIsMainAdmin(admin);
      // As configurações da página do revendedor são a fonte de identidade
      // já cadastrada no painel. A Vitrine IA pode sobrescrevê-las separadamente.
      const [{ data: promo, error: promoError }, { data: page, error: pageError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from("promo_brand_settings" as any)
          .select("brand_name,logo_url,whatsapp,primary_color").eq("owner_id",user.id).maybeSingle(),
        supabase.from("reseller_pages" as any)
          .select("display_name,logo_url,whatsapp,primary_color").eq("owner_id",user.id).maybeSingle(),
        supabase.from("profiles")
          .select("full_name,phone,whatsapp").eq("id",user.id).maybeSingle(),
      ]);
      if (promoError) throw promoError;
      if (pageError) throw pageError;
      if (profileError) throw profileError;
      const saved = promo as Partial<Brand> | null;
      const registered = page as {display_name?:string|null;logo_url?:string|null;whatsapp?:string|null;primary_color?:string|null} | null;
      const p = profile as {full_name?:string|null;phone?:string|null;whatsapp?:string|null} | null;
      const resolveValue = (...values:(string|null|undefined)[]) => values.find(value=>!!value?.trim()) || "";
      const merged: Brand = {
        brand_name: resolveValue(saved?.brand_name === defaultBrand.brand_name ? "" : saved?.brand_name,registered?.display_name,p?.full_name,saved?.brand_name,defaultBrand.brand_name),
        logo_url: resolveValue(saved?.logo_url,registered?.logo_url),
        whatsapp: resolveValue(saved?.whatsapp,registered?.whatsapp,p?.whatsapp,p?.phone),
        primary_color: resolveValue(saved?.primary_color,registered?.primary_color,defaultBrand.primary_color),
      };
      setBrand(admin ? { ...adminBrand, logo_url: mode === "banner" ? (resolveValue(saved?.logo_url,registered?.logo_url).replace(/^\/?favicon\.ico$/i, "") || officialLogoUrl) : resolveValue(saved?.logo_url, registered?.logo_url, adminBrand.logo_url) } : merged);
      return user.id;
    }, retry:1,
    refetchOnWindowFocus: mode !== "banner",
    refetchOnReconnect: mode !== "banner",
    refetchOnMount: mode !== "banner",
    staleTime: mode === "banner" ? Infinity : 0,
  });
  const feed = useQuery({
    queryKey: ["vitrine-feed",kind,debouncedSearch],
    queryFn: async () => runFeed({ data: { feed: kind === "movie" ? "movie_recent" : "tv_recent", query: debouncedSearch || undefined } }),
    staleTime: mode === "banner" ? Infinity : 300000,
    refetchOnWindowFocus: mode !== "banner",
    refetchOnReconnect: mode !== "banner",
    refetchOnMount: mode !== "banner",
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
    },staleTime:mode === "banner" ? Infinity : 30000,
    refetchOnWindowFocus: mode !== "banner",
    refetchOnReconnect: mode !== "banner",
    refetchOnMount: mode !== "banner",
  });
  const aiQuota = useQuery({
    queryKey:["vitrine-ai-quota",settings.data,today],
    enabled: mode === "ai" && !!settings.data,
    queryFn: async () => {
      const {data,error} = await supabase.from("vitrine_ai_daily_quota" as any)
        .select("used_count").eq("owner_id",settings.data!).eq("quota_day",today).maybeSingle();
      if (error) throw error;
      return Number((data as {used_count?:number}|null)?.used_count ?? 0);
    },
    staleTime:15000,
  });
  const remainingArts = Math.max(0,5-(aiQuota.data ?? 0));

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
    : [];
  const shown = mode === "banner" ? (bannerReady ? chosen.slice(0, 1) : []) : chosen.slice(0, templates.find(x=>x.id===template)?.count ?? 4);
  // A cota é cobrada por nova composição; baixar/compartilhar a mesma prévia
  // novamente não consome outra criação dentro desta sessão.
  const artSignature = JSON.stringify({
    items:shown.map(x=>[x.tmdb_id,x.media_type]),
    kind,template,format,headline,serverNames,mode,
    brand:[brand.brand_name,brand.whatsapp,brand.logo_url,brand.primary_color],
    localLogo:[logoUpload.length,logoUpload.slice(-32),removeBlackLogo],
    backgroundColor,textColor,accentColor,hideStudioMark,
  });
  const canReusePreview = grantedArtSignature === artSignature;

  const featuredDetail = useQuery({
    queryKey: ["vitrine-featured-details", shown[0]?.media_type, shown[0]?.tmdb_id],
    enabled: shown.length === 1 && !!shown[0]?.tmdb_id && !shown[0]?.overview?.trim(),
    queryFn: async () => runDetail({ data: { media: shown[0].media_type, id: shown[0].tmdb_id } }),
    staleTime: 600000,
    retry: 1,
  });
  useEffect(() => {
    // Nunca reutilizar o cenário de outro título ou formato sem gerar novamente.
    setAiBackground("");
  },[shown[0]?.tmdb_id,kind,template,format]);
  const dimensions = sizes[format];
  const posterKeys = shown.map(item => item.poster_path || "").filter(Boolean);
  const posterSignature = posterKeys.join("|");
  const requestedLogo = logoUpload || brand.logo_url;
  const imagesReady = !imagesLoading && shown.length > 0 && posterKeys.every(key => !!embeddedPosters[key]);
  useEffect(() => {
    let active = true;
    setImagesLoading(true);
    setImageError("");
    setAssetWarning("");
    async function prepareAssets() {
      const required = shown.filter(item => !!item.poster_path);
      try {
        const posterResults = await Promise.all(required.map(async item => {
          try {
            return [item.poster_path!, await toEmbeddedImage(poster(item.poster_path))] as const;
          } catch {
            return [item.poster_path!, fallbackPoster(item.title)] as const;
          }
        }));
        let logo = "";
        let logoFailed = false;
        if (requestedLogo) {
          try { logo = await prepareTransparentLogo(await toEmbeddedImage(requestedLogo), removeBlackLogo); }
          catch {
            logoFailed = true;
            if (isMainAdmin) {
              try { logo = await toEmbeddedImage(mode === "banner" ? officialLogoUrl : "/favicon.ico"); } catch { /* Keep text branding */ }
            }
          }
        }
        if (active) {
          setEmbeddedPosters(Object.fromEntries(posterResults));
          setEmbeddedLogo(logo);
          setAssetWarning([
            posterResults.some(([,data]) => data.startsWith("data:image/svg+xml")) ? "Algumas capas não puderam ser carregadas; foi usado um fundo alternativo." : "",
            logoFailed ? "A URL da logo não permitiu carregamento. Envie um PNG pelo dispositivo ou use uma URL pública com CORS." : "",
          ].filter(Boolean).join(" "));
        }
      } catch (error) {
        if (active) setImageError(error instanceof Error ? error.message : "Erro ao preparar a arte.");
      } finally {
        if (active) setImagesLoading(false);
      }
    }
    void prepareAssets();
    return () => { active = false; };
  }, [posterSignature, requestedLogo, isMainAdmin, removeBlackLogo]);

  const previewScale = Math.min(1, Math.max(0.1, (previewWidth - 16) / dimensions.w));
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const update = () => setPreviewWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const year = (s: string | null) => s?.slice(0,4) || "";
  const shortOverview = (value?: string | null, limit = 240) => { const clean = value?.trim() || ""; return clean.length > limit ? `${clean.slice(0,limit).trimEnd()}…` : clean; };
  const caption = isMainAdmin ? `🚀 ${headline.trim()} Confira os destaques do Stream Monitor. #StreamMonitor` : `🎬 ${headline.trim()}! Confira os destaques com ${brand.brand_name.trim()}.${brand.whatsapp ? ` Fale conosco: ${brand.whatsapp}` : ""} #VitrineIA`;

  function uploadLogo(file?: File) {
    if (!file) return;
    if (!["image/png","image/jpeg","image/webp"].includes(file.type)) return toast.error("Envie uma logo PNG, JPG ou WEBP.");
    if (file.size > 2*1024*1024) return toast.error("A logo deve ter no máximo 2 MB.");
    const reader = new FileReader();
    reader.onload = () => { setLogoUpload(String(reader.result || "")); toast.success("Logo aplicada à arte. Para reutilizá-la futuramente, mantenha também uma URL HTTPS salva."); };
    reader.onerror = () => toast.error("Não foi possível ler a logo.");
    reader.readAsDataURL(file);
  }

  async function claimCreditForPreview() {
    // Static TMDB banners do not consume scarce AI inference credits.
    if (mode === "banner") return;
    if (grantedArtRef.current === artSignature) return;
    if (creditInFlight.current) return creditInFlight.current;
    const job = (async () => {
      const {data,error} = await supabase.rpc("claim_vitrine_ai_art" as any);
      void qc.invalidateQueries({queryKey:["vitrine-ai-quota"]});
      if (error) throw new Error("Não foi possível validar as artes de hoje. " + error.message);
      const outcome = data as {allowed?:boolean}|null;
      if (!outcome?.allowed) throw new Error("Limite de 5 artes por dia atingido. Volte amanhã.");
      grantedArtRef.current = artSignature;
      setGrantedArtSignature(artSignature);
    })();
    creditInFlight.current = job;
    try { await job; } finally { creditInFlight.current = null; }
  }

  async function generateAiBanner() {
    if (mode !== "ai" || !settings.data || generatingAi || shown.length !== 1) return;
    setGeneratingAi(true);
    try {
      const {data:{session},error} = await supabase.auth.getSession();
      if (error || !session?.access_token) throw new Error("Faça login novamente para usar a IA.");
      const item = shown[0];
      const overview = item.overview || (
        featuredDetail.data?.detail?.tmdb_id === item.tmdb_id
          ? featuredDetail.data.detail.overview : ""
      ) || "";
      const response = await fetch(aiWorkerUrl,{
        method:"POST",
        headers:{
          "Authorization":"Bearer " + session.access_token,
          "apikey":import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({title:item.title,mediaType:item.media_type,overview,year:item.release_date?.slice(0,4),genre:featuredDetail.data?.detail?.genres?.join(", ") || "",style:aiStyle,format})
      });
      const result = await response.json().catch(() => ({})) as {image?:string;error?:string};
      if (!response.ok || !result.image) throw new Error(result.error || "Não foi possível gerar esta arte.");
      if (!/^data:image\/(png|jpeg);base64,/.test(result.image)) throw new Error("A IA retornou uma imagem inválida.");
      setAiBackground(result.image);
      grantedArtRef.current = artSignature;
      setGrantedArtSignature(artSignature);
      toast.success("Arte criada com IA! Veja a prévia e baixe o PNG.");
    } catch(error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar a arte com IA.");
    } finally {
      void qc.invalidateQueries({queryKey:["vitrine-ai-quota"]});
      setGeneratingAi(false);
    }
  }

  async function makePng() {
    if (!artRef.current || shown.length===0) throw new Error(mode === "banner" ? "Escolha um título e clique em Gerar banner." : "Escolha um título e gere o cenário com IA.");
    if (mode === "ai" && !aiBackground) throw new Error("Gere primeiro o cenário da obra com IA.");
    if (!imagesReady) throw new Error(imageError || "As imagens ainda estão sendo preparadas.");
    try {
      return await toPng(artRef.current, {
        width: dimensions.w, height: dimensions.h, pixelRatio: 1,
        // Images are already inlined; avoid cross-origin font and cache-bust fetches.
        cacheBust: false, skipFonts: true,
        backgroundColor, style: { transform: "none", transformOrigin: "top left" },
      });
    } catch (error) {
      throw new Error("Falha ao renderizar o PNG. " + (error instanceof Error ? error.message : String(error)));
    }
  }

  async function shareTelegram() {
    setSharing(true);
    try {
      const src=await makePng();
      const blob = pngDataUrlToBlob(src);
      const file = new File([blob], "vitrine-stream-monitor.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await claimCreditForPreview();
        await navigator.share({ files: [file], title: headline });
      } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("Imagem copiada! Abra o Telegram e pressione Ctrl+V na conversa.");
        } catch {
          savePngLocally(blob, "vitrine-stream-monitor.png");
          toast.info("PNG baixado. Anexe o arquivo à sua conversa no Telegram.");
        }
      } else {
        savePngLocally(blob, "vitrine-stream-monitor.png");
        toast.info("PNG baixado. Anexe o arquivo à sua conversa no Telegram.");
      }
    } catch(error) {
      if (error instanceof Error && error.name==="AbortError") return;
      toast.error(error instanceof Error ? error.message : "Falha ao compartilhar. Tente baixar o PNG.");
    } finally {setSharing(false);}
  }

  async function saveBrand() {
    setSaving(true);
    try {
      if (!settings.data) throw new Error("Sessão indisponível");
      const payload = {
        owner_id: settings.data, brand_name: isMainAdmin ? "Stream Monitor" : brand.brand_name.trim().slice(0,100),
        logo_url: brand.logo_url.trim() || null, whatsapp: isMainAdmin ? null : sanitize(brand.whatsapp) || null,
        primary_color: isMainAdmin ? "#2563eb" : brand.primary_color,
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
      const image = pngDataUrlToBlob(src);
      await claimCreditForPreview();
      const filename = `vitrine-${format}-${Date.now()}.png`;
      savePngLocally(image, filename);
      toast.success("PNG gerado. Confira seus downloads ou arquivos.");

      // A gravação no Cloud é complementar: não deve impedir o download.
      try {
        if (image.size > 5 * 1024 * 1024) throw new Error("PNG acima do limite do histórico (5 MB).");
        const path = `${settings.data}/${crypto.randomUUID()}.png`;
        const { error: storageError } = await supabase.storage.from("promo-arts")
          .upload(path, image, { contentType: "image/png", upsert: false });
        if (storageError) throw storageError;
        const { error } = await supabase.from("promo_generations" as any).insert({
          owner_id: settings.data, media_type: kind, template, format,
          title: headline.trim().slice(0, 140),
          items: shown.map(x => ({ tmdb_id: x.tmdb_id, media_type: x.media_type, title: x.title })),
          caption, storage_path: path,
        });
        if (error) throw error;
        void qc.invalidateQueries({ queryKey: ["vitrine-history"] });
      } catch {
        toast.warning("O PNG foi gerado, mas não foi possível salvar no histórico do Cloud.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar PNG.");
    } finally {
      setExporting(false);
    }
  }

  return <div className="space-y-5 max-w-7xl mx-auto p-3 sm:p-5">
    <nav className="flex flex-wrap items-center gap-2" aria-label="Tipo de vitrine">
      <Link to="/app" className="mr-auto text-sm text-muted-foreground hover:text-foreground">← Voltar ao painel</Link>
      <Link to="/vitrine-banner" className={`rounded-lg border px-4 py-2 text-sm font-semibold ${mode === "banner" ? "border-blue-500 bg-blue-600 text-white" : "border-border hover:bg-muted"}`}>Vitrine Banner</Link>
      <Link to="/vitrine-ai" className={`rounded-lg border px-4 py-2 text-sm font-semibold ${mode === "ai" ? "border-blue-500 bg-blue-600 text-white" : "border-border hover:bg-muted"}`}>Vitrine IA</Link>
    </nav>
    <Card className="p-6 bg-gradient-to-r from-blue-950/70 to-slate-950/70 border-blue-500/25">
      <div className="flex items-center gap-2 text-blue-300 text-xs uppercase tracking-widest"><Sparkles size={18}/> Stream Monitor Studio</div>
      <h1 className="text-3xl font-extrabold mt-2">{mode === "ai" ? "Vitrine IA" : "Vitrine Banner"}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">{mode === "ai" ? "Gere um cenário original por IA de acordo com o filme ou série escolhido, sua sinopse e seu gênero." : "Modelo profissional como o da prévia: sua marca, pôster inteiro, nome e sinopse do título, e WhatsApp em destaque. Escolha o filme ou série e gere a arte quadrada."} O catálogo TMDB não comprova disponibilidade nos servidores.</p>
    </Card>
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
      <div className="space-y-4">
        <details open className="rounded-xl border border-border/70">
          <summary className={mode === "ai" ? "hidden" : "cursor-pointer px-4 py-3 font-semibold text-sm"}>Identidade da marca, logo e WhatsApp</summary>
          <Card className="p-4 space-y-3">
          <h2 className="font-bold">{isMainAdmin ? "Identidade oficial · Stream Monitor" : "Identidade da revenda"}</h2>
          <label className="text-sm block">Nome da marca<Input disabled={isMainAdmin} className="mt-1" maxLength={100} value={isMainAdmin ? "Stream Monitor" : brand.brand_name} onChange={e=>setBrand({...brand,brand_name:e.target.value})}/></label>
          {!isMainAdmin && <label className="text-sm block">WhatsApp<Input className="mt-1" placeholder="DDD + número" value={brand.whatsapp} onChange={e=>setBrand({...brand,whatsapp:e.target.value})}/></label>}
          <label className="text-sm block">URL HTTPS da logo<Input className="mt-1" placeholder="https://..." value={brand.logo_url} onChange={e=>setBrand({...brand,logo_url:e.target.value})}/></label>
          <label className="text-sm block">Enviar logo do dispositivo<input aria-label="Enviar logo" className="mt-1 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadLogo(e.target.files?.[0])}/></label>
          {logoUpload && <div className="flex items-center gap-2 text-xs"><img src={logoUpload} alt="Logo enviada" className="h-10 w-16 object-contain"/><span>Upload aplicado à prévia</span><Button variant="ghost" size="sm" onClick={()=>setLogoUpload("")}>Remover</Button></div>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={removeBlackLogo} onChange={e=>setRemoveBlackLogo(e.target.checked)}/>Remover automaticamente o fundo preto opaco da logo</label>
          <p className="text-xs text-muted-foreground">Se o preto fizer parte da logo, desative essa opção. PNG com transparência existente será preservado.</p>
          <p className="text-xs text-muted-foreground">Para manter a logo após recarregar, salve uma URL HTTPS pública que permita CORS. O envio local já serve para gerar e baixar a arte atual.</p>
          <div className="space-y-2">
            <p className="text-xs font-medium">Temas prontos — escolha e personalize</p>
            <div className="grid grid-cols-4 gap-2">
              {([{name:"Vermelho",main:"#e11d2e",bg:"#110407",detail:"#ff3854"},{name:"Azul",main:"#2563eb",bg:"#050e23",detail:"#60a5fa"},{name:"Roxo",main:"#9333ea",bg:"#140521",detail:"#c084fc"},{name:"Dourado",main:"#a16207",bg:"#1d1305",detail:"#fbbf24"}]).map(c=><button key={c.name} type="button" aria-label={`Aplicar tema ${c.name}`} onClick={()=>{setBrand(b=>({...b,primary_color:c.main}));setBackgroundColor(c.bg);setAccentColor(c.detail);}} className="flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] hover:border-current"><span className="h-6 w-6 rounded-full border border-white/30" style={{background:`linear-gradient(135deg,${c.main},${c.bg})`}}/>{c.name}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([{label:"Cor principal",value:brand.primary_color,change:(v:string)=>setBrand({...brand,primary_color:v})},{label:"Fundo",value:backgroundColor,change:setBackgroundColor},{label:"Texto",value:textColor,change:setTextColor},{label:"Detalhes",value:accentColor,change:setAccentColor}]).map(c=><label key={c.label} className="text-xs flex gap-2 items-center"><input aria-label={c.label} type="color" value={c.value} onChange={e=>c.change(e.target.value)}/>{c.label}</label>)}
          </div>
          <Button onClick={saveBrand} disabled={saving || settings.isLoading} variant="outline" className="w-full"><Save className="h-4 w-4 mr-2"/>Salvar identidade</Button>
          </Card>
        </details>
        <Card className="p-4 space-y-3">
          <h2 className="font-bold flex gap-2 items-center"><LayoutTemplate size={18}/> Configurar arte</h2>
          {mode === "ai" && <label className="text-sm block">Nomes dos servidores no fundo (separe por •)<Input className="mt-1" maxLength={160} placeholder="Ex.: Gold • Diamante • Premium" value={serverNames} onChange={e=>setServerNames(e.target.value)}/></label>}
          <label className="text-sm block">{mode === "banner" ? "Frase de destaque" : "Título"}<Input className="mt-1" maxLength={100} value={headline} onChange={e=>setHeadline(e.target.value)}/></label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={kind==="movie"?"default":"outline"} onClick={()=>{setKind("movie");setSelected([]);setBannerReady(false);}}><Film className="h-4 w-4 mr-2"/>Filmes</Button>
            <Button variant={kind==="tv"?"default":"outline"} onClick={()=>{setKind("tv");setSelected([]);setBannerReady(false);}}><Tv className="h-4 w-4 mr-2"/>Séries</Button>
          </div>
          {mode === "ai" && <label className="text-sm block">Modelo<select className="w-full mt-1 rounded-md border bg-background p-2" value={template} onChange={e=>{setTemplate(e.target.value as Template);setSelected([]);}}>{templates.filter(t => t.count === 1).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
          <label className="text-sm block">Pesquisar filme ou série<Input className="mt-1" placeholder="Digite o nome para buscar na TMDB" value={search} onChange={e=>{setSearch(e.target.value);setSelected([]);setBannerReady(false);}}/></label>
          {mode === "ai" && <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={hideStudioMark} onChange={e=>setHideStudioMark(e.target.checked)}/>Ocultar marca Vitrine IA na arte</label>}
          {mode === "ai" && <label className="text-sm block">Formato<select className="w-full mt-1 rounded-md border bg-background p-2" value={format} onChange={e=>setFormat(e.target.value as Format)}>{Object.entries(sizes).map(([key,val])=><option value={key} key={key}>{val.label}</option>)}</select></label>}
          {mode === "banner" && <p className="text-xs text-blue-300">Modelo da arte: quadrado 1080×1080, com marca no topo, pôster completo à esquerda, sinopse à direita e WhatsApp no rodapé.</p>}
          {mode === "ai" && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={confirmedOnly} onChange={e=>{setConfirmedOnly(e.target.checked);setSelected([]);}}/>Somente títulos encontrados no catálogo monitorado</label>}
          {mode === "ai" && <p className="text-xs text-muted-foreground">Para anunciar “já disponível”, confirme a presença no servidor específico. O filtro de catálogo monitorado não garante que o vídeo reproduza.</p>}
          {mode === "ai" && <div className="rounded-xl border border-blue-400/30 bg-gradient-to-br from-blue-950/55 via-slate-950/60 to-blue-950/30 p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <h3 className="text-sm font-bold text-blue-200 flex items-center gap-2"><Sparkles size={17}/> Gerador de banner com IA</h3>
              <span className="rounded-full bg-blue-500/15 border border-blue-400/30 px-3 py-1 text-xs font-semibold text-blue-200">
                {aiQuota.isLoading?"Consultando créditos...":aiQuota.isError?"Cota indisponível":remainingArts+" de 5 artes restantes"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">A Cloudflare cria um cenário cinematográfico original com base na sinopse. A marca, a capa e o título são adicionados pelo Stream Monitor.</p>
            <label className="text-sm block">Estilo visual
              <select className="w-full mt-1 rounded-md border border-blue-500/30 bg-background p-2" value={aiStyle} onChange={e=>setAiStyle(e.target.value as AiStyle)}>
                {aiStyles.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <Button type="button" onClick={generateAiBanner} className="w-full bg-blue-600 hover:bg-blue-500 text-white"
              disabled={generatingAi || shown.length!==1 || !settings.data || remainingArts===0 || aiQuota.isError}>
              <Sparkles size={17} className="mr-2"/>{generatingAi?"IA criando seu cenário...":"Gerar banner premium com IA"}
            </Button>
            {shown.length!==1 && <p className="text-xs text-amber-300">Para gerar com IA, escolha um modelo de 1 título em destaque.</p>}
            {aiBackground && <p className="text-xs text-blue-300">Cenário exclusivo aplicado à prévia. Ajuste os textos e exporte a arte.</p>}
            <p className="text-xs text-muted-foreground">5 novas artes por conta a cada dia, no horário de Fortaleza. Uma nova geração com IA consome 1 crédito; repetir o download da mesma prévia não consome outro.</p>
          </div>}
          {mode === "banner" && <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{feed.isLoading ? "Pesquisando filmes e séries..." : "Selecione a capa do título desejado:"}</p>
            {feed.isError && <p className="text-sm text-destructive">Não foi possível pesquisar este título.</p>}
            <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1">
              {sourceItems.slice(0, 18).map(item => <button type="button" key={`${item.media_type}-${item.tmdb_id}`} onClick={() => { setSelected([item.tmdb_id]); setBannerReady(false); }} className={`overflow-hidden rounded-lg border-2 p-1 text-left ${selected.includes(item.tmdb_id) ? "border-blue-500 bg-blue-500/10" : "border-border/50"}`} aria-pressed={selected.includes(item.tmdb_id)}>
                <img className="aspect-[2/3] w-full rounded-md object-contain bg-slate-900" src={poster(item.poster_path)} alt={item.title} loading="lazy"/>
                <span className="block truncate text-[11px] mt-1">{item.title}</span>
              </button>)}
            </div>
            {feed.data && !sourceItems.length && <p className="text-sm text-muted-foreground">Nenhum título encontrado. Confira o nome pesquisado.</p>}
            {!isMainAdmin && sanitize(brand.whatsapp).length < 10 && <p className="text-xs text-amber-300">Informe seu WhatsApp com DDD na identidade da revenda para gerar um banner com contato válido.</p>}
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" disabled={selected.length !== 1 || !chosen.length || feed.isLoading || (!isMainAdmin && sanitize(brand.whatsapp).length < 10)} onClick={() => { setBannerReady(true); toast.success("Banner pronto! Confira a prévia e baixe o PNG."); }}><LayoutTemplate size={17} className="mr-2"/>Gerar banner</Button>
          </div>}
          {imagesLoading && <p className="text-xs text-muted-foreground">Preparando capas e logo para exportação...</p>}
          {imageError && <p className="text-xs text-destructive">Falha ao preparar imagem: {imageError}</p>}
          {assetWarning && <p className="text-xs text-amber-500">{assetWarning}</p>}
          <Button className="w-full" disabled={exporting || generatingAi || !imagesReady || settings.isLoading || (mode === "ai" && (!aiBackground || (remainingArts===0 && !canReusePreview)))} onClick={download}><Download size={17} className="mr-2"/>{exporting?"Preparando PNG...":"Baixar PNG"}</Button>
          <Button variant="outline" className="w-full" disabled={sharing || generatingAi || !imagesReady || (mode === "ai" && (!aiBackground || (remainingArts===0 && !canReusePreview)))} onClick={shareTelegram}><Share2 size={17} className="mr-2"/>{sharing?"Preparando...":"Compartilhar PNG (Telegram)"}</Button>
          <Button variant="outline" className="w-full" onClick={()=>{navigator.clipboard.writeText(caption).then(()=>toast.success("Legenda copiada")).catch(()=>toast.error("Não foi possível copiar"));}}>Copiar legenda</Button>
        </Card>
      </div>
      <div className="min-w-0 space-y-4">
        <Card className="p-4 overflow-hidden">
          <p className="font-semibold mb-3">Prévia da sua arte</p>
          <div ref={previewRef} className="w-full min-w-0 overflow-hidden rounded-xl bg-[#080307] p-2">
            <div className="relative mx-auto overflow-hidden rounded-lg" style={{width:dimensions.w*previewScale,height:dimensions.h*previewScale}}>
              <div style={{width:dimensions.w,height:dimensions.h,position:"absolute",top:0,left:0,transform:`scale(${previewScale})`,transformOrigin:"top left"}}>
                <div ref={artRef} style={{width:dimensions.w,height:dimensions.h,overflow:"hidden",position:"relative",boxSizing:"border-box",fontFamily:"Arial,Helvetica,sans-serif",color:textColor,backgroundColor}}>
                  {aiBackground && <img src={aiBackground} alt="" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",filter:"saturate(1.18) contrast(1.06) brightness(.85)"}}/>}
                  <div style={{position:"absolute",inset:0,background:aiBackground ? "linear-gradient(105deg,#020817bf 0%,#03112344 54%,#07112b70 100%),linear-gradient(0deg,#020715c7,transparent 66%)" : `radial-gradient(ellipse at 97% 12%, ${brand.primary_color}b0 0%, transparent 54%), radial-gradient(ellipse at 0% 87%, ${brand.primary_color}80 0%, transparent 50%), linear-gradient(145deg, ${backgroundColor} 0%, #040205 63%, ${backgroundColor} 100%)`}}/>
                  <div style={{position:"absolute",inset:0,opacity:0.14,backgroundImage:"repeating-linear-gradient(128deg,transparent 0px,transparent 79px,#ffffff 80px,transparent 82px)"}}/>
                  <div style={{position:"absolute",top:format==="story"?80:format==="feed"?42:8,left:-46,right:-46,fontSize:format==="story"?115:format==="feed"?85:60,fontWeight:900,lineHeight:1,color:"transparent",WebkitTextStroke:"2px #ffffff1c",letterSpacing:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"clip",textTransform:"uppercase",textAlign:"center",pointerEvents:"none"}}>{serverNames.trim() || brand.brand_name || "STREAM MONITOR"}</div>
                  <div style={{position:"absolute",inset:0,boxShadow:"inset 0 0 130px #0009",pointerEvents:"none"}}/>

                  <div style={{position:"relative",zIndex:1,height:"100%",boxSizing:"border-box",padding:format==="story"?"98px 100px 115px":format==="feed"?"54px 78px 68px":"30px 58px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",gap:format==="landscape"?12:26}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,minHeight:mode==="banner"?180:format==="story"?150:format==="feed"?92:44,maxWidth:"100%"}}>
                      {embeddedLogo && <img src={embeddedLogo} alt="" style={{width:mode==="banner"?320:format==="story"?245:format==="feed"?170:110,height:mode==="banner"?126:format==="story"?100:format==="feed"?62:36,objectFit:"contain",objectPosition:"center",display:"block",maxWidth:"100%",flexShrink:0}}/>}
                      <div style={{fontSize:format==="story"?45:format==="feed"?35:24,fontWeight:800,maxWidth:"100%",textAlign:"center",overflowWrap:"anywhere",letterSpacing:-0.8,textShadow:"0 3px 18px #000c"}}>{brand.brand_name || "Minha Revenda"}</div>
                      {!hideStudioMark && <div style={{fontSize:format==="story"?17:12,letterSpacing:5,color:accentColor}}>VITRINE IA</div>}
                    </div>

                    <div style={{width:"100%",flex:1,minHeight:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:format==="story"?52:format==="feed"?26:12}}>
                      <div style={{width:"100%",height:format==="story"?90:format==="feed"?70:46,borderRadius:format==="landscape"?18:30,border:`3px solid ${accentColor}`,background:"linear-gradient(100deg,#090407ed,#41040be3)",boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"space-between",padding:format==="landscape"?"0 22px":"0 28px",boxShadow:`0 0 32px ${brand.primary_color}55, inset 0 1px 12px #ffffff16`,fontSize:format==="story"?30:format==="feed"?26:19}}>
                        <span style={{color:accentColor,fontSize:format==="story"?42:format==="feed"?35:26}}>⌕</span>
                        <span style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",padding:"0 12px"}}>{headline || "Agora disponível"}</span>
                        <span style={{color:accentColor,fontSize:format==="story"?37:format==="feed"?32:22}}>◉</span>
                      </div>
                      <div style={{width:"100%",flex:1,minHeight:0,display:"grid",gridTemplateColumns:shown.length===1?"1fr":"repeat(2,minmax(0,1fr))",gridTemplateRows:shown.length<=2?"minmax(0,1fr)":`repeat(${Math.ceil(shown.length/2)},minmax(0,1fr))`,gap:format==="story"?22:format==="feed"?16:8}}>
                        {shown.map(item=>{
                          const featured = shown.length===1;
                          const vertical = format==="story";
                          const cover = embeddedPosters[item.poster_path||""] || fallbackPoster(item.title);
                          const synopsis = shortOverview(item.overview || (featuredDetail.data?.detail?.tmdb_id===item.tmdb_id ? featuredDetail.data.detail.overview : ""),vertical?320:format==="feed"?210:145);
                          if (featured && aiBackground) {
                            return <div key={item.tmdb_id} style={{position:"relative",width:"100%",height:"100%",minWidth:0,minHeight:0,overflow:"hidden",borderRadius:28,border:"2px solid "+accentColor+"88",background:"transparent",boxShadow:"inset 0 0 50px #0008,0 16px 44px #0008"}}>
                              <div style={{position:"absolute",inset:0,background:"linear-gradient(0deg,#020714f5 0%,#04132bba 30%,#04142b4a 58%,transparent 86%)"}}/>
                              <div style={{position:"absolute",top:format==="story"?28:14,left:format==="story"?32:22,display:"flex",alignItems:"center",gap:12}}>
                                <span style={{background:"#071a36d9",border:"1px solid "+accentColor+"aa",borderRadius:30,padding:format==="story"?"10px 18px":"5px 11px",fontSize:format==="story"?20:format==="feed"?15:11,fontWeight:900,letterSpacing:2}}>{item.media_type==="movie"?"FILME":"SÉRIE"}</span>
                                {!!year(item.release_date) && <span style={{fontWeight:800,fontSize:format==="story"?21:format==="feed"?16:12,textShadow:"0 2px 10px #000"}}>{year(item.release_date)}</span>}
                              </div>
                              <div style={{position:"absolute",left:format==="story"?30:format==="feed"?24:14,right:format==="story"?30:format==="feed"?24:14,bottom:format==="story"?36:format==="feed"?27:12,display:"flex",alignItems:"flex-end",gap:format==="story"?28:format==="feed"?22:15}}>
                                <img src={cover} alt={item.title} style={{flexShrink:0,height:format==="story"?480:format==="feed"?320:200,maxWidth:"43%",objectFit:"contain",objectPosition:"bottom",borderRadius:12,filter:"drop-shadow(0 12px 18px #000b)"}}/>
                                <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:format==="story"?18:format==="feed"?10:5}}>
                                  <div style={{fontWeight:900,color:accentColor,letterSpacing:format==="story"?3:2,fontSize:format==="story"?20:format==="feed"?14:11,textShadow:"0 2px 8px #000"}}>DESTAQUE ESPECIAL</div>
                                  <div style={{fontWeight:900,lineHeight:1.08,fontSize:format==="story"?58:format==="feed"?43:29,overflowWrap:"anywhere",display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:2,overflow:"hidden",textShadow:"0 4px 15px #000"}}>{item.title}</div>
                                  <div style={{fontSize:format==="story"?22:format==="feed"?17:12,lineHeight:1.42,color:"#e2edff",display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:format==="landscape"?2:format==="feed"?4:5,overflow:"hidden",textShadow:"0 2px 10px #000"}}>{synopsis || "Sinopse não informada pela TMDB."}</div>
                                  <div style={{height:3,width:"35%",borderRadius:5,background:accentColor,marginTop:format==="landscape"?1:6}}/>
                                </div>
                              </div>
                            </div>;
                          }
                          return <div key={item.tmdb_id} style={{position:"relative",minWidth:0,minHeight:0,overflow:"hidden",borderRadius:featured?28:format==="story"?22:14,border:`2px solid ${accentColor}55`,boxShadow:"0 16px 44px #0009",background:aiBackground&&featured?"linear-gradient(135deg,#07192acc,#071023a0)":"linear-gradient(135deg,#08172c,#050a15)",display:"flex",flexDirection:featured?(vertical?"column":"row"):"column"}}>
                            <div style={{position:"relative",minWidth:0,minHeight:0,overflow:"hidden",flex:featured?(vertical?"1 1 70%":"0 0 56%"):"1 1 auto",background:"#081528"}}>
                              <img src={cover} alt="" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"blur(25px) brightness(.25)",transform:"scale(1.14)"}}/>
                              <img src={cover} alt={item.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",objectPosition:"center",padding:featured?(vertical?9:5):4,boxSizing:"border-box",filter:"drop-shadow(0 12px 20px #0009)"}}/>
                              <div style={{position:"absolute",top:featured?18:8,left:featured?18:8,borderRadius:30,background:"#071326e8",border:`1px solid ${accentColor}88`,padding:featured?"9px 17px":"4px 9px",fontWeight:800,fontSize:featured?(vertical?23:format==="feed"?18:12):(vertical?15:10),letterSpacing:1}}>{item.media_type==="movie"?"FILME":"SÉRIE"}</div>
                            </div>
                            <div style={{flex:featured?(vertical?"0 0 auto":"1 1 44%"):"0 0 auto",minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center",gap:featured?(vertical?16:format==="feed"?11:6):3,padding:featured?(vertical?"22px 28px 26px":format==="feed"?"22px 23px":"8px 15px"):(format==="story"?"10px 12px":"7px 9px"),background:aiBackground&&featured?"linear-gradient(145deg,#08182fd9,#050b18c2)":"linear-gradient(145deg,#08182f,#050b18)"}}>
                              {featured && <div style={{fontSize:vertical?20:format==="feed"?14:10,fontWeight:800,letterSpacing:2,color:accentColor,textTransform:"uppercase"}}>DESTAQUE ESPECIAL</div>}
                              <div style={{fontSize:featured?(vertical?41:format==="feed"?36:20):(vertical?22:format==="feed"?19:12),fontWeight:900,lineHeight:1.12,overflowWrap:"anywhere",display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:featured?3:2,overflow:"hidden",textShadow:"0 2px 8px #0008"}}>{item.title}</div>
                              {featured && !!year(item.release_date) && <div style={{fontSize:vertical?21:format==="feed"?17:12,color:"#c5d8fa",fontWeight:700}}>{year(item.release_date)}</div>}
                              {featured && <div style={{fontSize:vertical?21:format==="feed"?17:12,lineHeight:1.45,color:"#d6e3f8",display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:vertical?6:format==="feed"?6:3,overflow:"hidden"}}>{synopsis || "Sinopse não informada pela TMDB."}</div>}
                              {featured && <div style={{height:3,width:"38%",background:accentColor,borderRadius:3,marginTop:4}}/>}
                            </div>
                          </div>;
                        })}
                      </div>
                    </div>
                    {!isMainAdmin && <div style={{width:"100%",height:format==="story"?89:format==="feed"?72:48,boxSizing:"border-box",clipPath:"polygon(3% 0,97% 0,100% 28%,100% 75%,97% 100%,3% 100%,0 75%,0 28%)",padding:6,background:`linear-gradient(125deg,${accentColor},#63000b,${accentColor})`,boxShadow:"0 0 30px #e11d2e77",flexShrink:0}}>
                      <div style={{height:"100%",width:"100%",clipPath:"polygon(3% 0,97% 0,100% 28%,100% 75%,97% 100%,3% 100%,0 75%,0 28%)",background:"linear-gradient(90deg,#130207,#300007,#090205)",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:format==="story"?26:format==="feed"?22:15,fontWeight:900,textAlign:"center",whiteSpace:"nowrap"}}>
                        <span>FALE PELO</span><span style={{color:accentColor}}>WHATSAPP</span><span>{sanitize(brand.whatsapp) || "SEU NÚMERO"}</span>
                      </div>
                    </div>}
                  </div>
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
        {mode === "ai" && <Card className="p-4 space-y-3">
          <h2 className="font-bold">Escolha o filme ou a série {selected.length>0?`(${selected.length})`:""}</h2>
          <div className="space-y-1">
            <label htmlFor="vitrine-search-catalog" className="text-sm font-semibold">Pesquisar filme ou série pelo nome</label>
            <div className="flex gap-2">
              <Input id="vitrine-search-catalog" type="search" placeholder="Ex.: Irmã do Pecado, Tenzing..." value={search} onChange={e=>{setSearch(e.target.value);setSelected([]);}} />
              {search && <Button type="button" variant="outline" onClick={()=>{setSearch("");setSelected([]);setBannerReady(false);}}>Limpar</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Resultados da TMDB para {kind==="movie"?"filmes":"séries"}; selecione uma capa para aplicar na arte.</p>
          </div>
          {feed.isLoading && <p className="text-sm text-muted-foreground">Buscando títulos na TMDB...</p>}
          {feed.isError && <p className="text-sm text-destructive">Não foi possível consultar o catálogo: {String(feed.error)}</p>}
          {feed.data && sourceItems.length===0 && <p className="text-sm text-muted-foreground">Nenhum título encontrado para esse filtro.</p>}
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3">
            {sourceItems.map(item=><button type="button" key={item.tmdb_id} title={item.title} onClick={()=>setSelected(old=>old.includes(item.tmdb_id)?[]:[item.tmdb_id])} className={`rounded-xl overflow-hidden text-left border-2 transition-colors ${selected.includes(item.tmdb_id)?"border-blue-500":"border-transparent"}`}>
              <img src={poster(item.poster_path)} alt={item.title} loading="lazy" className="aspect-[2/3] w-full object-cover"/>
              <span className="block text-[11px] font-medium truncate px-1 mt-1">{item.title} {year(item.release_date)}</span>
            </button>)}
          </div>
          <p className="text-xs text-muted-foreground">Selecione uma capa. Respeite os créditos, as licenças e a disponibilidade do conteúdo antes de publicar.</p>
        </Card>}
      </div>
    </div>
  </div>;
}
