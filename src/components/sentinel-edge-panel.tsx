import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, AlertTriangle, CheckCircle2, RadioTower, RefreshCw, ShieldCheck,
  Server, Globe2, Clock3, ArrowUpRight, Search, ShieldAlert, Wifi, WifiOff,
  Network, ChevronDown, ChevronUp,
} from "lucide-react";

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
  http_fresh?: boolean; dns_fresh?: boolean;
};
type Summary = { checked_at: string; coverage: Count; priority_servers: Item[] };
type Filter = "all" | "critical" | "evidence";

const LABELS: Record<string, string> = {
  dns_offline: "DNS offline",
  confirmed_down: "Queda confirmada",
  confirmed_up: "Operacional",
  disagreement: "Sondas divergentes",
  insufficient_data: "Aguardando evidências",
  investigating: "Em investigação",
};

function percent(n: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round(n / total * 100))) : 0;
}
function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Sem verificação";
}
function shortTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}
function evidenceStatus(status: string | null) {
  if (!status) return "Sem dados";
  return ({ up: "Online", down: "Offline", degraded: "Instável", unknown: "Indefinido" } as Record<string, string>)[status] ?? status;
}
function statusTone(verdict: string) {
  if (verdict === "confirmed_down" || verdict === "dns_offline") return "border-red-500/25 bg-red-500/10 text-red-400";
  if (verdict === "disagreement" || verdict === "investigating") return "border-amber-500/25 bg-amber-500/10 text-amber-400";
  return "border-blue-500/25 bg-blue-500/10 text-blue-300";
}

function Kpi({
  label, value, detail, icon: Icon, tone = "blue",
}: {
  label: string; value: string | number; detail: string;
  icon: typeof Activity; tone?: "blue" | "green" | "amber" | "red";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/15",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/15",
    red: "bg-red-500/10 text-red-400 border-red-500/15",
  };
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-background/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border " + tones[tone]}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Probe({ label, value, timeValue }: { label: string; value: string | null; timeValue: string | null }) {
  const isUp = value === "up";
  const isDown = value === "down";
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className={"h-2 w-2 shrink-0 rounded-full " + (isUp ? "bg-emerald-400" : isDown ? "bg-red-400" : "bg-amber-400")} />
        <span className="text-sm font-semibold">{evidenceStatus(value)}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{shortTime(timeValue)}</span>
      </div>
    </div>
  );
}

export function SentinelEdgePanel() {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useQuery<Summary>({
    queryKey: ["sentinel-edge-coverage"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_sentinel_edge_summary");
      if (error) throw error;
      if (!data || !data.coverage || !Array.isArray(data.priority_servers)) {
        throw new Error("Resposta incompleta do monitoramento regional");
      }
      return data as Summary;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => {
    const all = query.data?.priority_servers ?? [];
    return all.filter((item) =>
      filter === "all" ||
      (filter === "critical" && ["dns_offline", "confirmed_down", "disagreement"].includes(item.verdict)) ||
      (filter === "evidence" && ["insufficient_data", "investigating"].includes(item.verdict)),
    );
  }, [query.data, filter]);

  if (query.isLoading) return (
    <Card className="overflow-hidden border-blue-500/20 p-5 sm:p-7" aria-busy="true">
      <div className="flex items-center gap-3"><RadioTower className="h-6 w-6 animate-pulse text-blue-400" /><span className="font-semibold">Conectando ao Sentinel Edge...</span></div>
      <p className="mt-2 text-sm text-muted-foreground">Consultando dados independentes da origem e do Cloudflare.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />)}
      </div>
    </Card>
  );
  if (query.isError || !query.data) return (
    <Card role="alert" className="border-destructive/30 p-6">
      <div className="flex items-center gap-2 font-semibold text-red-400"><ShieldAlert className="h-5 w-5" /> Sentinel Edge temporariamente indisponível</div>
      <p className="mt-2 text-sm text-muted-foreground">Sem evidências suficientes não é possível confirmar que os servidores estejam online.</p>
      <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-primary" onClick={() => query.refetch()}>
        <RefreshCw className="h-4 w-4" /> Consultar novamente
      </button>
    </Card>
  );

  const { coverage: c } = query.data;
  const coveragePct = percent(c.two_recent, c.total);
  const edgePct = percent(c.edge_recent, c.total);
  const originPct = percent(c.origin_recent, c.total);
  const isComplete = c.total > 0 && c.two_recent === c.total;
  const hasCritical = c.confirmed_down > 0 || c.dns_offline > 0;
  const healthLabel = c.total === 0 ? "Nenhum servidor monitorado" : isComplete ? "Cobertura completa" : "Cobertura parcial";

  return (
    <div className="sm-sentinel space-y-4 sm:space-y-5">
      <Card className="relative overflow-hidden border-blue-500/25 bg-card p-0">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="relative p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-500/10 text-blue-400 sm:h-14 sm:w-14">
                <RadioTower className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <div className="min-w-0">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-[.2em] text-blue-400">Observabilidade multi-região</div>
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Sentinel <span className="text-blue-400">Edge 2.0</span></h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Uma visão das evidências reais: servidor de origem, Cloudflare Edge e DNS, com distinção entre falha confirmada e falta de dados.</p>
              </div>
            </div>
            <button type="button" onClick={() => query.refetch()} disabled={query.isFetching}
              className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2 text-sm font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-60"
              aria-label="Atualizar dados do Sentinel Edge">
              <RefreshCw className={"h-4 w-4 " + (query.isFetching ? "animate-spin" : "")} />
              Atualizar dados
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Servidores monitorados" value={c.total} detail="Com monitoramento ativo" icon={Server} />
            <Kpi label="Cobertura dupla" value={coveragePct + "%"} detail={c.two_recent + " de " + c.total + " verificados"} icon={Network} tone={isComplete ? "green" : "blue"} />
            <Kpi label="Quedas confirmadas" value={c.confirmed_down} detail="Origem e Edge indicam falha" icon={WifiOff} tone={c.confirmed_down ? "red" : "green"} />
            <Kpi label="DNS offline" value={c.dns_offline} detail="Falhas recentes de DNS" icon={Globe2} tone={c.dns_offline ? "amber" : "green"} />
          </div>

          <div className="mt-4 grid gap-4 rounded-2xl border border-border/70 bg-background/40 p-4 sm:p-5 lg:grid-cols-[1fr_1fr]">
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Cobertura independente das sondas</span>
                <Badge variant="outline" className={isComplete ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>{healthLabel}</Badge>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  { label: "Cloudflare Edge", value: c.edge_recent, pct: edgePct, color: "bg-blue-400" },
                  { label: "Servidor de origem", value: c.origin_recent, pct: originPct, color: "bg-cyan-400" },
                  { label: "Duas sondas recentes", value: c.two_recent, pct: coveragePct, color: "bg-emerald-400" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <strong className="tabular-nums">{row.value}/{c.total} <span className="text-muted-foreground">({row.pct}%)</span></strong>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={row.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.pct}>
                      <div className={"h-full rounded-full " + row.color} style={{ width: row.pct + "%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Kpi label="Operacionais" value={c.confirmed_up} detail="Duas sondas" icon={CheckCircle2} tone="green" />
              <Kpi label="Dados insuficientes" value={c.missing_evidence} detail="Sem dupla confirmação" icon={AlertTriangle} tone="amber" />
              <Kpi label="Divergências" value={c.disagreements} detail="Sondas discordam" icon={Activity} tone={c.disagreements ? "amber" : "blue"} />
              <Kpi label="Dados atrasados" value={c.stale_primary} detail="HTTP ou DNS" icon={Clock3} tone={c.stale_primary ? "amber" : "blue"} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className={"h-2 w-2 rounded-full " + (isComplete && !hasCritical ? "bg-emerald-400" : "bg-amber-400")} />
              {isComplete && !hasCritical ? "Cobertura completa, sem falhas confirmadas" : "Monitoramento ativo · verifique os alertas e a cobertura"}
            </span>
            <span className="flex items-center gap-1.5 tabular-nums"><Clock3 className="h-3.5 w-3.5" /> Atualizado: {time(query.data.checked_at)}</span>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border-border/70 bg-card p-0">
        <div className="border-b border-border/60 px-5 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5 text-blue-400" /> Central de evidências</h3>
              <p className="mt-1 text-xs text-muted-foreground">Prioridades de verificação e comparação de respostas entre regiões.</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" /> Exibindo até 30 prioridades</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtrar evidências">
            {([
              ["all", "Todas"],
              ["critical", "Quedas e divergências"],
              ["evidence", "Sem confirmação"],
            ] as [Filter, string][]).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                className={"rounded-xl border px-3 py-2 text-xs font-semibold transition-colors " + (filter === key ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-border/70 text-muted-foreground hover:bg-muted")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {rows.length === 0 && <div className="px-5 py-9 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-blue-400" />
            <p className="mt-3 font-semibold">{query.data.priority_servers.length === 0 ? "Nenhuma anomalia prioritária" : "Nenhum resultado neste filtro"}</p>
            <p className="mt-1 text-xs text-muted-foreground">A ausência de registros aqui não substitui a confirmação de todas as sondas.</p>
          </div>}
          {rows.map((s) => {
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="px-4 py-3 sm:px-6">
                <button type="button" onClick={() => setExpanded(isOpen ? null : s.id)} aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left hover:bg-muted/20">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">HTTP {evidenceStatus(s.http_status)} · DNS {evidenceStatus(s.dns_status)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={"max-w-[150px] whitespace-normal text-right text-[10px] sm:max-w-none " + statusTone(s.verdict)}>{LABELS[s.verdict] ?? "Em análise"}</Badge>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && <div className="mt-2 grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-2">
                  <Probe label="Origem · sondagem" value={s.origin_status} timeValue={s.origin_at} />
                  <Probe label="Cloudflare Edge · sondagem" value={s.edge_status} timeValue={s.edge_at} />
                  <p className="sm:col-span-2 text-xs text-muted-foreground">Origem: {time(s.origin_at)} · Edge: {time(s.edge_at)}. Dados recentes não garantem funcionamento de todo o catálogo.</p>
                </div>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
          <span>Origem e Edge: janela de 10 min · DNS/HTTP: janela de 15 min</span>
          <span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> Veredito baseado em evidências <ArrowUpRight className="h-3 w-3" /></span>
        </div>
      </Card>
    </div>
  );
}
