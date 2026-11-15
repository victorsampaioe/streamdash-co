import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Cloud,RefreshCw,ShieldCheck,Clock3,Activity,AlertTriangle} from "lucide-react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {getCloudflareEdgeHeartbeat} from "@/lib/cloudflare-heartbeat.functions";

const fortalezaTime=(date:string)=>new Intl.DateTimeFormat("pt-BR",{
  timeZone:"America/Fortaleza",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",
}).format(new Date(date));

export function CloudflareHeartbeatPanel(){
  const get=useServerFn(getCloudflareEdgeHeartbeat);
  const query=useQuery({
    queryKey:["admin-cloudflare-edge-heartbeat"],
    queryFn:()=>get(),
    refetchInterval:60_000,
    staleTime:30_000,
    retry:1,
  });
  const report=query.data;
  const last=report?.last;
  const age=last?Date.now()-Date.parse(last.at):Infinity;
  const fresh=age>=0&&age<25*60_000;
  const healthy=fresh&&last?.online===true;
  const state=query.isError?"Indisponível para consulta":
    !last?"Aguardando medição":
    !fresh?"Medição atrasada":
    healthy?"Página respondeu":"Falha de acesso";

  return <Card className="overflow-hidden border-blue-500/25 bg-gradient-to-br from-[#0c1e39] via-[#09182e] to-[#08111f] text-white">
    <CardContent className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-sky-300">
            <Cloud className="h-4 w-4"/> Cloudflare Workers + D1
          </div>
          <h2 className="text-lg font-black sm:text-xl">Monitoramento Edge independente</h2>
          <p className="max-w-2xl text-xs leading-5 text-slate-300">
            Verificação HTTP da página pública do Stream Monitor a cada 10 minutos,
            sem substituir o monitoramento dos servidores IPTV.
          </p>
        </div>
        <Button size="sm" variant="outline"
          className="border-blue-400/30 bg-blue-500/10 text-sky-100 hover:bg-blue-500/20"
          onClick={()=>query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching?"animate-spin":""}`}/>Atualizar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[.045] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
            {healthy?<ShieldCheck className="h-4 w-4 text-emerald-400"/>:<AlertTriangle className="h-4 w-4 text-amber-400"/>}
            Estado da página pública
          </div>
          <p className={`text-lg font-black ${healthy?"text-emerald-300":"text-amber-300"}`}>
            {query.isPending?"Consultando...":state}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {last?.http_status?`HTTP ${last.http_status}`:"Sem resposta registrada"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.045] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
            <Activity className="h-4 w-4 text-sky-300"/> Resposta Edge → site
          </div>
          <p className="text-2xl font-black">{last?`${(last.latency_ms/1000).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} s`:"—"}</p>
          <p className="mt-1 text-xs text-slate-400">Medida pela Cloudflare, não pelo navegador do cliente</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.045] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300">
            <Clock3 className="h-4 w-4 text-blue-300"/> Registros automáticos (24h)
          </div>
          <p className="text-2xl font-black">{report?.last24h.total??"—"}</p>
          <p className="mt-1 text-xs text-slate-400">
            {report?`${report.last24h.succeeded} respostas positivas`:"Aguardando consulta"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-slate-400">
        <span>{last?`Última verificação: ${fortalezaTime(last.at)} (Fortaleza)`:"Nenhum teste agendado confirmado ainda"}</span>
        <span>Fonte: Cloudflare D1 · Somente dados públicos do site</span>
      </div>
      {query.isError&&<p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
        Não foi possível consultar a Cloudflare agora. O monitoramento independente pode continuar executando; confira novamente em instantes.
      </p>}
    </CardContent>
  </Card>;
}
