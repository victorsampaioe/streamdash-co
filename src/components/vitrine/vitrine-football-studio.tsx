import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, RefreshCw, Trophy } from "lucide-react";
import { FootballSchedulePoster } from "@/components/vitrine/football-schedule-poster";
import { getVitrineFootballMatches, type FootballMatch } from "@/lib/vitrine-football.functions";

const today = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
type Branding = { name: string; logo: string; contact: string; accent: string };
const fallbackBrand: Branding = {name:"Stream Monitor",logo:"/favicon.ico",contact:"",accent:"#146df2"};
const baseSize = 1080;
const safeColor = (input: string | undefined) => /^#[0-9a-f]{6}$/i.test(input||"") ? input! : "#146df2";

/** One poster per three real fixtures; no user-facing game, team or player controls. */
export function VitrineFootballStudio() {
  const load = useServerFn(getVitrineFootballMatches);
  const [brand, setBrand] = useState<Branding>(fallbackBrand);
  const [saving, setSaving] = useState<number | null>(null);
  const [width, setWidth] = useState(520);
  const wrapper = useRef<HTMLDivElement>(null);
  const posterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [day, setDay] = useState(today);

  useEffect(() => {
    const holder = wrapper.current;
    if (!holder) return;
    const observe = new ResizeObserver(() => setWidth(Math.min(550, Math.max(280, holder.clientWidth - 8))));
    observe.observe(holder);
    return () => observe.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    async function fetchBrand() {
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) return;
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

  const games = useQuery({
    queryKey:["vitrine-football-ftwb",day],
    queryFn:()=>load({data:{date:day}}),
    staleTime:5*60_000,
    retry:1,
  });
  const groups = useMemo(() => {
    const matches = games.data?.matches ?? [];
    return [matches.slice(0,3),matches.slice(3,6),matches.slice(6,9)].filter((group)=>group.length>0);
  }, [games.data]);
  const haveChannels = (match:FootballMatch) => (match.broadcasts||[]).slice(0,3).join(" • ") || "TRANSMISSÃO NÃO CONFIRMADA";

  async function download(index:number) {
    const node=posterRefs.current[index];
    if (!node || saving!==null) return;
    setSaving(index);
    try {
      await document.fonts.ready;
      const images=Array.from(node.querySelectorAll("img"));
      await Promise.all(images.map(async (img)=>{
        if(img.complete) return;
        await new Promise<void>((resolve)=>{img.addEventListener("load",()=>resolve(),{once:true});img.addEventListener("error",()=>resolve(),{once:true});});
      }));
      const png=await toPng(node,{pixelRatio:1,cacheBust:true,backgroundColor:"#071227",skipFonts:false});
      const anchor=document.createElement("a");
      anchor.href=png;
      anchor.download="stream-monitor-futebol-"+day+"-arte-"+(index+1)+".png";
      anchor.click();
      toast.success("Arte "+(index+1)+" baixada.");
    } catch {
      toast.error("Falha ao exportar PNG. Uma imagem externa pode estar bloqueando a exportação.");
    } finally {setSaving(null);}
  }
  const scale=width/baseSize;
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold tracking-[.18em] text-blue-400"><Trophy size={17}/> STREAM MONITOR</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Jogos do dia · Artes automáticas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Os confrontos dos principais times são organizados automaticamente em até 3 artes, com até 3 canais por jogo.</p>
      </div>
      <Button type="button" variant="outline" disabled={games.isFetching} onClick={()=>{setDay(today());void games.refetch()}}>
        <RefreshCw size={16} className={games.isFetching?"mr-2 animate-spin":"mr-2"}/> Atualizar jogos
      </Button>
    </div>
    {games.isPending&&<Card className="p-8 text-center">Consultando jogos de hoje…</Card>}
    {games.isError&&<Card className="p-8 text-center text-destructive" role="alert">
      {games.error instanceof Error?games.error.message:"Não foi possível consultar os jogos de hoje."}
    </Card>}
    {games.isSuccess&&groups.length===0&&<Card className="p-8 text-center">Não foram encontrados jogos dos times prioritários para hoje.</Card>}
    {games.isSuccess&&groups.length>0&&<div className="grid gap-8 xl:grid-cols-2" ref={wrapper}>
      {groups.map((group,index)=>{
        const featured=group.find(match=>!!match.playerPhoto);
        const badgeImages:Record<string,string>={};
        for(const match of group) {
          if(match.homeBadge)badgeImages[match.homeBadge]=match.homeBadge;
          if(match.awayBadge)badgeImages[match.awayBadge]=match.awayBadge;
        }
        const channels=Object.fromEntries(group.map(match=>[match.id,haveChannels(match)]));
        return <Card className="overflow-hidden p-4" key={group.map(m=>m.id).join("|")}>
          <div className="flex items-center justify-between gap-3 pb-4">
            <strong className="text-base">Arte {index+1} de {groups.length}</strong>
            <Button type="button" disabled={saving!==null} onClick={()=>void download(index)}>
              <Download size={16} className="mr-2"/>{saving===index?"Preparando PNG…":"Baixar PNG"}
            </Button>
          </div>
          <div className="relative mx-auto overflow-hidden rounded-xl" style={{width,maxWidth:"100%",height:width}}>
            <div style={{width:baseSize,height:baseSize,transform:"scale("+scale+")",transformOrigin:"top left"}}>
              <div ref={el=>{posterRefs.current[index]=el;}} style={{width:baseSize,height:baseSize}}>
                <FootballSchedulePoster kind="today" format="feed" matches={group} day={day}
                  headline="JOGOS DO DIA" brand={brand.name} logo={brand.logo} contact={brand.contact}
                  badgeImages={badgeImages} broadcastByMatch={channels}
                  playerPhoto={featured?.playerPhoto||""} playerName={featured?.playerName||""}
                  stadium="" accent={brand.accent}/>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Canais não informados pela fonte aparecem como transmissão não confirmada. Confirme antes de divulgar.</p>
        </Card>;
      })}
    </div>}
  </main>;
}
