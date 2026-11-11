import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download, History, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/falhas")({
  component: HistoricalFailures,
  head: () => ({ meta: [{ title: "Radar Histórico de Falhas | Stream Monitor" }] }),
});
type Server = { id: string; name: string; dns_status: string | null; current_status: string | null };
type Incident = { id: string; server_id: string; started_at: string; ended_at: string | null; incident_type: string | null; reason: string | null; regions: string | null };
type Hourly = { server_id: string; hour: string; total: number; ups: number; downs: number; degraded: number; avg_latency_ms: number | null };
function csvField(value: unknown) {
  const s=String(value ?? "");
  return '"'+(/^\s*[=+@\-]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';
}
function downloadCsv(name:string, data:unknown[][]) {
  const text=data.map(row=>row.map(csvField).join(";")).join("\r\n");
  const blob=new Blob(["\ufeff"+text],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);
}
function HistoricalFailures() {
  const [days,setDays]=useState(7);
  const [selected,setSelected]=useState("");
  const data=useQuery({
    queryKey:["historical-failures",days],queryFn:async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)throw new Error("Faça login.");
      const since=new Date(Date.now()-days*86400000).toISOString();
      const {data:servers,error:sErr}=await supabase.from("servers").select("id,name,dns_status,current_status").eq("owner_id",user.id).limit(1000);
      if(sErr)throw sErr;
      const ss=(servers??[]) as Server[];
      if(!ss.length)return {servers:ss,incidents:[] as Incident[],hourly:[] as Hourly[],limit:false};
      const ids=ss.map(s=>s.id),incidents:Incident[]=[],hourly:Hourly[]=[];
      let limit=false;
      for(let i=0;i<ids.length;i+=50){
        const batch=ids.slice(i,i+50);
        const [a,b]=await Promise.all([
          supabase.from("incidents").select("id,server_id,started_at,ended_at,incident_type,reason,regions").in("server_id",batch).gte("started_at",since).order("started_at",{ascending:false}).limit(1000),
          supabase.from("checks_hourly").select("server_id,hour,total,ups,downs,degraded,avg_latency_ms").in("server_id",batch).gte("hour",since).order("hour",{ascending:false}).limit(5000)
        ]);
        if(a.error)throw a.error;if(b.error)throw b.error;
        incidents.push(...(a.data??[]) as Incident[]);
        hourly.push(...(b.data??[]) as Hourly[]);
        if(a.data?.length===1000 || b.data?.length===5000)limit=true;
      }
      return {servers:ss,incidents,hourly,limit:limit||ss.length===1000};
    },staleTime:60000,refetchInterval:60000,
  });
  const subset=useMemo(()=>({
    incidents:(data.data?.incidents??[]).filter(x=>!selected||x.server_id===selected),
    hourly:(data.data?.hourly??[]).filter(x=>!selected||x.server_id===selected),
  }),[data.data,selected]);
  const stats=useMemo(()=>{
    const byHour=Array.from({length:24},(_,hour)=>({hour,total:0,downs:0}));
    const perServer=new Map<string,{incidents:number,open:number,downChecks:number,totalChecks:number}>();
    for(const i of subset.incidents) {
      const cur=perServer.get(i.server_id)??{incidents:0,open:0,downChecks:0,totalChecks:0};
      cur.incidents++; if(!i.ended_at)cur.open++;perServer.set(i.server_id,cur);
    }
    for(const h of subset.hourly){
      const cur=perServer.get(h.server_id)??{incidents:0,open:0,downChecks:0,totalChecks:0};
      cur.downChecks+=h.downs??0;cur.totalChecks+=h.total??0;perServer.set(h.server_id,cur);
      const hour=Number(new Intl.DateTimeFormat("en-GB",{hour:"2-digit",hourCycle:"h23",timeZone:"America/Fortaleza"}).format(new Date(h.hour)));
      byHour[hour].total+=h.total??0;byHour[hour].downs+=h.downs??0;
    }
    const overall=[...perServer.values()].reduce((x,y)=>({incidents:x.incidents+y.incidents,open:x.open+y.open,downChecks:x.downChecks+y.downChecks,totalChecks:x.totalChecks+y.totalChecks}),{incidents:0,open:0,downChecks:0,totalChecks:0});
    return {byHour,perServer,overall};
  },[subset]);
  const max=Math.max(1,...stats.byHour.map(x=>x.total?x.downs/x.total:0));
  const names=new Map((data.data?.servers??[]).map(s=>[s.id,s.name]));
  const format=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR"):"Em aberto";
  return <div className="space-y-5">
    <Card className="p-5 bg-gradient-to-br from-blue-600/10 to-transparent border-blue-500/20">
      <div className="flex gap-2 items-center text-blue-400 text-sm"><History size={18}/> Inteligência de incidentes</div>
      <h1 className="text-3xl font-bold mt-1">Radar Histórico de Falhas</h1>
      <p className="mt-2 text-sm text-muted-foreground">Análise com dados realmente medidos no Lovable Cloud. Acessibilidade HTTP/DNS não é prova de reprodução IPTV.</p>
    </Card>
    <div className="flex flex-wrap gap-2 items-center">
      <select className="rounded-md border bg-background px-3 py-2 text-sm" value={days} onChange={e=>setDays(Number(e.target.value))}>
        {[1,7,14,30].map(x=><option key={x} value={x}>Últimos {x} dia{x>1?"s":""}</option>)}
      </select>
      <select className="rounded-md border bg-background px-3 py-2 text-sm" value={selected} onChange={e=>setSelected(e.target.value)}>
        <option value="">Todos os meus servidores</option>{data.data?.servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Button variant="outline" onClick={()=>data.refetch()} disabled={data.isFetching}><RefreshCw size={16} className="mr-2"/>Atualizar</Button>
      <Button variant="outline" disabled={!subset.incidents.length} onClick={()=>downloadCsv("stream-monitor-incidentes.csv",[
        ["Servidor","Início","Recuperação","Tipo","Motivo","Regiões"],
        ...subset.incidents.map(i=>[names.get(i.server_id),i.started_at,i.ended_at,i.incident_type,i.reason,i.regions])
      ])}><Download size={16} className="mr-2"/>Exportar evidências CSV</Button>
    </div>
    {data.isLoading && <Card className="p-6">Carregando dados históricos...</Card>}
    {data.isError && <Card className="p-6 text-red-400">Erro ao consultar histórico: {String(data.error)}</Card>}
    {data.data && <>
      {data.data.limit && <p className="text-sm text-amber-400">Limite de registros atingido: os indicadores podem não refletir todos os eventos do período.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Incidentes registrados",stats.overall.incidents],
          ["Incidentes em aberto",stats.overall.open],
          ["Checagens com falha",stats.overall.downChecks],
          ["Total de checagens",stats.overall.totalChecks],
        ].map(([name,n])=><Card key={String(name)} className="p-4"><div className="text-xs text-muted-foreground">{name}</div><div className="text-2xl font-bold mt-2">{Number(n).toLocaleString("pt-BR")}</div></Card>)}
      </div>
      <Card className="p-5 space-y-3">
        <h2 className="font-bold">Frequência de falhas por hora (Fortaleza)</h2>
        <p className="text-xs text-muted-foreground">Proporção de checagens com falha, não volume de usuários afetados. Horas sem dados aparecem sem barra.</p>
        <div className="grid grid-cols-12 gap-1.5 items-end h-40">
          {stats.byHour.map(x=><div key={x.hour} title={`${x.hour}h: ${x.downs}/${x.total} falhas`} className="flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full rounded-t-sm bg-blue-500/70 min-h-0" style={{height:x.total?`${Math.max(3,Math.round((x.downs/x.total)/max*100))}%`:"0%"}}/>
            <span className="text-[9px] text-muted-foreground">{x.hour%2===0?`${x.hour}h`:""}</span>
          </div>)}
        </div>
      </Card>
      <Card className="p-5 overflow-auto">
        <h2 className="font-bold mb-3">Servidores com ocorrências</h2>
        <table className="w-full text-sm text-left"><thead className="text-muted-foreground"><tr><th className="p-2">Servidor</th><th className="p-2">Incidentes</th><th className="p-2">Em aberto</th><th className="p-2">Falhas/checagens</th></tr></thead><tbody>
          {[...stats.perServer.entries()].sort((a,b)=>b[1].incidents-a[1].incidents).map(([id,s])=><tr key={id} className="border-t"><td className="p-2">{names.get(id)||"Servidor removido"}</td><td className="p-2">{s.incidents}</td><td className="p-2">{s.open}</td><td className="p-2">{s.downChecks}/{s.totalChecks}</td></tr>)}
        </tbody></table>
      </Card>
      <Card className="p-5 space-y-3"><h2 className="font-bold flex items-center gap-2"><AlertCircle size={18}/> Últimos incidentes</h2>
        {subset.incidents.length===0 && <p className="text-muted-foreground text-sm">Nenhum incidente registrado neste período.</p>}
        {subset.incidents.slice(0,30).map(i=><div className="border-t py-3" key={i.id}><div className="font-semibold">{names.get(i.server_id)||"Servidor removido"} · {i.incident_type||"Incidente"}</div><div className="text-xs text-muted-foreground mt-1">Início: {format(i.started_at)} · Recuperação: {format(i.ended_at)}</div><p className="text-xs mt-1">{i.reason||"Sem motivo registrado"}</p></div>)}
      </Card>
    </>}
  </div>;
}
