import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, BarChart3 } from "lucide-react";

type Daily = { day: string; total: number; up: number; down: number; avg_latency: number | null };
type Summary = {
  sample_count: number; ok: number; down: number; degraded: number;
  avg_latency: number | null; first_observed: string | null; last_observed: string | null;
};
type Report = { server_name: string; requested_days: number; summary: Summary; daily: Daily[]; note: string };
type Server = { id: string; name: string };

function formatDate(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR") : "Sem dados";
}
function toCsvCell(value: string | number | null) {
  const str = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(str) ? "'" + str : str;
  return '"' + safe.replace(/"/g,'""') + '"';
}
export function HistoryReportPanel({ servers }: { servers: Server[] }) {
  const [serverId, setServerId] = useState("");
  const [days, setDays] = useState(30);
  const query = useQuery<Report | null>({
    queryKey: ["sample-history", serverId, days],
    enabled: !!serverId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_server_history_report", {
        _server_id: serverId, _days: days,
      });
      if (error) throw error;
      return data as Report | null;
    },
    staleTime: 60_000,
  });
  const report = query.data, summary = report?.summary;
  const pct = summary && summary.sample_count > 0
    ? 100 * summary.ok / summary.sample_count : null;

  function download() {
    if (!report || !serverId) return;
    const lines = [["Data","Amostras","Respondendo","Falhas","Latência média (ms)"],
      ...report.daily.map(d => [d.day,d.total,d.up,d.down,d.avg_latency ?? ""])];
    const body = lines.map(row => row.map(toCsvCell).join(";")).join("\r\n");
    const file = new Blob(["\ufeff" + body], {type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(file);
    const a=document.createElement("a");
    a.href=url;a.download=`stream-monitor-historico-${days}d.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <Card className="p-5 space-y-4">
    <h3 className="font-semibold flex gap-2 items-center"><BarChart3 className="h-4 w-4 text-blue-400"/> Histórico real de disponibilidade</h3>
    <p className="text-sm text-muted-foreground">
      Consulte até 90 dias de verificações existentes. Períodos anteriores à coleta não são tratados como online.
    </p>
    <div className="flex flex-wrap gap-3">
      <select className="rounded-lg border bg-background p-3 flex-1 min-w-48"
        aria-label="Servidor do histórico" value={serverId} onChange={e=>setServerId(e.target.value)}>
        <option value="">Selecione um servidor</option>
        {servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="rounded-lg border bg-background p-3" aria-label="Período"
        value={days} onChange={e=>setDays(Number(e.target.value))}>
        <option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option>
      </select>
    </div>
    {query.isLoading&&<p className="text-sm">Calculando a partir das verificações...</p>}
    {query.isError&&<p role="alert" className="text-sm text-destructive">Falha ao consultar histórico. Tente atualizar.</p>}
    {serverId&&report&&summary&&<div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Amostras registradas</p><strong className="text-xl">{summary.sample_count}</strong></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Respostas positivas</p><strong className="text-xl">{pct===null?"—":pct.toFixed(1)+"%"}</strong></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Falhas nas amostras</p><strong className="text-xl">{summary.down}</strong></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Latência média</p><strong className="text-xl">{summary.avg_latency??"—"} ms</strong></div>
      </div>
      <p className="text-xs text-muted-foreground">
        Dados de {formatDate(summary.first_observed)} até {formatDate(summary.last_observed)}.
        Disponibilidade amostral não equivale ao uptime contínuo ou SLA contratual.
      </p>
      {report.daily.length>0&&<div className="space-y-1">
        <p className="text-sm font-medium">Amostras por dia</p>
        {report.daily.slice(-14).map(d=><div key={d.day} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0">{d.day}</span>
          <div className="bg-muted rounded-full h-2 grow overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{width:`${d.total?100*d.up/d.total:0}%`}}/>
          </div>
          <span className="w-20 text-right">{d.total?Math.round(100*d.up/d.total):0}% · {d.total}</span>
        </div>)}
      </div>}
      <Button onClick={download} variant="outline" disabled={!report.daily.length}>
        <Download className="h-4 w-4 mr-2"/>Exportar histórico CSV
      </Button>
    </div>}
  </Card>;
}
