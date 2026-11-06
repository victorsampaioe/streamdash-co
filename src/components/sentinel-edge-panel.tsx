import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, RadioTower } from "lucide-react";

type Count = {
  total: number; origin_recent: number; edge_recent: number; two_recent: number;
  confirmed_down: number; confirmed_up: number; dns_offline: number;
  disagreements: number; missing_evidence: number; stale_primary: number;
};
type Item = {
  id: string; name: string; verdict: string;
  http_status: string; dns_status: string;
  origin_status: string | null; edge_status: string | null;
  origin_at: string | null; edge_at: string | null;
};
type Summary = { checked_at: string; coverage: Count; priority_servers: Item[] };

const LABELS: Record<string, string> = {
  dns_offline: "DNS offline confirmado",
  confirmed_down: "Duas sondas indicam falha",
  confirmed_up: "Duas sondas respondendo",
  disagreement: "Sondas em desacordo",
  insufficient_data: "Dados insuficientes",
  investigating: "Instabilidade em investigação",
};
function percent(n: number, total: number) {
  return total > 0 ? `${Math.round(n / total * 100)}%` : "—";
}
function time(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Sem verificação";
}

export function SentinelEdgePanel() {
  const query = useQuery<Summary>({
    queryKey: ["sentinel-edge-coverage"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_sentinel_edge_summary");
      if (error) throw error;
      if (!data?.coverage) throw new Error("Resposta incompleta do monitoramento regional");
      return data as Summary;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  if (query.isLoading) return <Card className="p-5">Conferindo sondas do Lovable e Cloudflare...</Card>;
  if (query.isError || !query.data) return (
    <Card role="alert" className="p-5 border-destructive/30">
      <p className="text-destructive font-semibold">Sentinel Edge indisponível</p>
      <p className="text-sm text-muted-foreground">Não foi possível obter as evidências. Não presuma que os servidores estejam online.</p>
      <button type="button" className="text-primary text-sm underline mt-2" onClick={() => query.refetch()}>Tentar novamente</button>
    </Card>
  );

  const { coverage: c, priority_servers: priority } = query.data;
  const complete = c.total > 0 && c.two_recent === c.total;
  return <div className="space-y-4">
    <Card className="p-5 space-y-3 border-blue-500/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold flex gap-2 items-center"><RadioTower className="h-5 w-5 text-blue-400" /> Sentinel Edge 2.0</h3>
        <Badge variant="outline">{complete ? "Cobertura atualizada" : "Cobertura parcial"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Evidências independentes da origem e do Cloudflare. Comparação dos últimos 10 minutos;
        DNS e HTTP primário dos últimos 15 minutos. Sem previsão infalível ou falso status online.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Cobertura dupla</div><div className="text-2xl font-bold">{c.two_recent}/{c.total}</div><div className="text-xs text-muted-foreground">{percent(c.two_recent,c.total)}</div></div>
        <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Origem recente</div><div className="text-2xl font-bold">{c.origin_recent}</div></div>
        <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Cloudflare recente</div><div className="text-2xl font-bold">{c.edge_recent}</div></div>
        <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Dados primários atrasados</div><div className="text-2xl font-bold">{c.stale_primary}</div></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="rounded-lg border p-3"><CheckCircle2 className="inline h-4 w-4 text-emerald-500 mr-1"/>Respondendo: <b>{c.confirmed_up}</b></div>
        <div className="rounded-lg border p-3"><AlertTriangle className="inline h-4 w-4 text-destructive mr-1"/>Queda: <b>{c.confirmed_down}</b></div>
        <div className="rounded-lg border p-3">DNS offline: <b>{c.dns_offline}</b></div>
        <div className="rounded-lg border p-3">Divergências: <b>{c.disagreements}</b></div>
      </div>
      <div className="text-xs text-muted-foreground">Sem duas evidências recentes: {c.missing_evidence} · Consultado em {time(query.data.checked_at)}</div>
    </Card>
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4"/> Investigação e prioridade</h3>
      {priority.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma divergência ou anomalia entre as evidências disponíveis.</p>}
      <div className="space-y-2">
        {priority.map(s => <div key={s.id} className="p-3 rounded-lg border border-border/70">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium text-sm">{s.name}</span>
            <Badge variant="outline">{LABELS[s.verdict] ?? "Em avaliação"}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Origem: {s.origin_status ?? "Sem dados"} ({time(s.origin_at)}) · Cloudflare: {s.edge_status ?? "Sem dados"} ({time(s.edge_at)}) · DNS: {s.dns_status}
          </div>
        </div>)}
      </div>
      {c.total > priority.length && <p className="text-xs text-muted-foreground">Até 30 servidores prioritários nesta visão. Demais continuam no monitoramento normal.</p>}
    </Card>
  </div>;
}
