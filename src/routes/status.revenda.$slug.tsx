import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Activity, Clock, ShieldCheck } from "lucide-react";

type PublicServer = {
  id: string; name: string; description: string | null;
  current_status: string; dns_status: string; dns_enabled: boolean;
  last_checked_at: string | null; last_dns_check_at: string | null;
  monitoring_paused: boolean; last_latency_ms: number | null;
};
type PublicPage = {
  name: string; description: string; checked_at: string;
  servers: PublicServer[];
};
export const Route = createFileRoute("/status/revenda/$slug")({
  component: ResellerStatusPage,
  head: ({params}) => ({meta:[
    {title:`Status ${params.slug} | Stream Monitor`},
    {name:"description",content:"Página pública de status dos servidores que o revendedor escolheu divulgar."},
    {name:"robots",content:"index,follow"},
  ]}),
});

function state(s: PublicServer): {label:string;tone:string;symbol:string} {
  const freshHttp = !!s.last_checked_at && Date.now()-new Date(s.last_checked_at).getTime() <= 15*60_000;
  const freshDns = s.dns_enabled === false || (!!s.last_dns_check_at && Date.now()-new Date(s.last_dns_check_at).getTime() <= 15*60_000);
  if (s.monitoring_paused || !freshHttp || !freshDns)
    return {label:"Dados insuficientes",tone:"text-amber-400",symbol:"🟡"};
  if (s.dns_enabled !== false && s.dns_status==="offline")
    return {label:"DNS offline",tone:"text-red-400",symbol:"🔴"};
  if (s.current_status==="down")
    return {label:"Serviço indisponível",tone:"text-red-400",symbol:"🔴"};
  if (s.dns_status==="unstable" || s.current_status==="degraded")
    return {label:"Instabilidade em análise",tone:"text-amber-400",symbol:"🟡"};
  if (s.current_status==="up" && (s.dns_enabled===false || s.dns_status==="online"))
    return {label:"Respondendo",tone:"text-emerald-400",symbol:"🟢"};
  return {label:"Sem conclusão",tone:"text-amber-400",symbol:"⚪"};
}
function ResellerStatusPage() {
  const {slug}=Route.useParams();
  const query=useQuery<PublicPage|null>({
    queryKey:["reseller-public-status",slug],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc("get_public_reseller_status",{_slug:slug});
      if(error)throw error;
      return data as PublicPage|null;
    },
    refetchInterval:30_000,
    staleTime:15_000,
  });
  const page=query.data;
  const items=page?.servers??[];
  const good=items.filter(s=>state(s).label==="Respondendo").length;
  const bad=items.filter(s=>state(s).symbol==="🔴").length;
  const remaining=items.length-good-bad;
  return <div className="min-h-screen bg-[#080f20] text-slate-100">
    <header className="border-b border-white/10 bg-[#0c1830]">
      <div className="max-w-4xl mx-auto px-5 py-4 flex flex-wrap justify-between items-center gap-3">
        <a href="/" className="font-extrabold text-lg">Stream <span className="text-blue-400">Monitor</span></a>
        <span className="text-xs tracking-wider text-slate-400">PÁGINA PÚBLICA DE STATUS</span>
      </div>
    </header>
    <main className="max-w-4xl mx-auto px-5 py-12 space-y-6">
      {query.isLoading&&<p>Carregando status...</p>}
      {query.isError&&<Card className="p-6" role="alert">Não foi possível consultar o status neste momento. Tente atualizar a página.</Card>}
      {!query.isLoading&&!query.isError&&!page&&<Card className="p-6">Esta página não existe ou está privada.</Card>}
      {page&&<>
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold">{page.name}</h1>
          {page.description&&<p className="text-slate-400">{page.description}</p>}
          <p className="text-xs text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3"/> Dados consultados em {new Date(page.checked_at).toLocaleString("pt-BR")}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-400">Respondendo</p><strong className="text-2xl text-emerald-400">{good}</strong></div>
          <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-400">Indisponíveis</p><strong className="text-2xl text-red-400">{bad}</strong></div>
          <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-400">Em análise</p><strong className="text-2xl text-amber-400">{remaining}</strong></div>
        </div>
        {items.length===0&&<Card className="p-6">Nenhum servidor foi autorizado para exibição pública.</Card>}
        <div className="space-y-3">
          {items.map(s=>{const st=state(s);return <div key={s.id} className="rounded-xl border border-white/10 bg-[#111c32] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-lg">{s.name}</h2>{s.description&&<p className="text-slate-400 text-sm">{s.description}</p>}</div>
              <span className={`text-sm font-semibold ${st.tone}`}>{st.symbol} {st.label}</span>
            </div>
            <div className="mt-3 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>HTTP: {s.last_checked_at?new Date(s.last_checked_at).toLocaleString("pt-BR"):"sem dados"}</span>
              <span>DNS: {s.dns_enabled===false?"desativado":s.last_dns_check_at?new Date(s.last_dns_check_at).toLocaleString("pt-BR"):"sem dados"}</span>
              <span>Latência: {s.last_latency_ms??"—"} ms</span>
            </div>
          </div>})}
        </div>
        <p className="text-xs text-slate-500">Esta página apresenta somente os servidores publicados pelo revendedor. Dados desatualizados não são interpretados como disponibilidade confirmada.</p>
      </>}
    </main>
    <footer className="max-w-4xl mx-auto px-5 py-8 border-t border-white/10 text-sm text-slate-400 flex gap-2 items-center">
      <ShieldCheck className="w-4 h-4"/> Monitoramento fornecido por <a className="text-blue-400 underline" href="https://streammonitor.site">Stream Monitor</a><Activity className="ml-auto w-4 h-4"/>
    </footer>
  </div>;
}
