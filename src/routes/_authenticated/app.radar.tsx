import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, Flame, Globe, Wifi } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRadarSnapshot } from "@/lib/radar.functions";
import type { RadarSnapshot } from "@/lib/radar.server";
import { cn } from "@/lib/utils";

const radarQuery = queryOptions<RadarSnapshot>({
  queryKey: ["radar-snapshot"],
  queryFn: () => getRadarSnapshot(),
  refetchInterval: 60_000,
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/app/radar")({
  head: () => ({
    meta: [
      { title: "Radar Brasil — StreamMonitor" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(radarQuery),
  errorComponent: RadarError,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
  component: RadarPage,
});

function RadarError({ error }: { error: Error }) {
  return (
    <Card className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-3" />
      <p className="font-medium">Não foi possível carregar o Radar</p>
      <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
    </Card>
  );
}

function RadarPage() {
  const { data } = useSuspenseQuery(radarQuery);
  return (
    <div className="space-y-6">
      <Header generatedAt={data.generated_at} />
      <StatsRow stats={data.stats} />

      <div className="grid lg:grid-cols-2 gap-4">
        <ExternalIncidentsCard incidents={data.externalIncidents} />
        <LatencyByRegionCard rows={data.byRegion} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <UnstableCard rows={data.unstable} />
        <PlaceholderCard
          icon={<Wifi className="h-5 w-5 text-muted-foreground" />}
          title="Provedores brasileiros com mais relatos"
          body="Este painel será alimentado pelo Diagnóstico Colaborativo (em breve). Sem dados inventados enquanto isso."
        />
      </div>

      <PlaceholderCard
        icon={<Globe className="h-5 w-5 text-muted-foreground" />}
        title="Mapa de calor Brasil (por estado)"
        body="Ativado quando houver dados suficientes por UF (via workers regionais e relatos colaborativos)."
      />
    </div>
  );
}

function Header({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">📡 Radar Brasil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status da internet em tempo real. Atualiza a cada 60 segundos.
        </p>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" />
        Atualizado {new Date(generatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}

function StatsRow({ stats }: { stats: RadarSnapshot["stats"] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Metric label="Servidores monitorados" value={stats.serversMonitored.toLocaleString("pt-BR")} />
      <Metric label="Checks nas últimas 24h" value={stats.totalChecks24h.toLocaleString("pt-BR")} />
      <Metric
        label="Uptime médio 24h"
        value={stats.uptimePct != null ? `${stats.uptimePct.toFixed(2)}%` : "—"}
        tone={stats.uptimePct != null && stats.uptimePct < 98 ? "warning" : "success"}
      />
      <Metric
        label="Incidentes abertos"
        value={String(stats.incidentsOpen)}
        tone={stats.incidentsOpen > 0 ? "destructive" : "success"}
      />
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "destructive" }) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-2xl font-bold font-mono", toneClass)}>{value}</div>
    </Card>
  );
}

const STATUS_STYLE: Record<string, { label: string; badge: "default" | "secondary" | "outline" | "destructive"; cls: string; icon: React.ReactNode }> = {
  operational:    { label: "Operacional",       badge: "outline",     cls: "text-success",     icon: <CheckCircle2 className="h-4 w-4" /> },
  degraded:       { label: "Degradado",          badge: "secondary",   cls: "text-warning",     icon: <AlertTriangle className="h-4 w-4" /> },
  partial_outage: { label: "Falha parcial",      badge: "destructive", cls: "text-warning",     icon: <AlertTriangle className="h-4 w-4" /> },
  major_outage:   { label: "Falha grave",        badge: "destructive", cls: "text-destructive", icon: <AlertTriangle className="h-4 w-4" /> },
  maintenance:    { label: "Manutenção",         badge: "secondary",   cls: "text-muted-foreground", icon: <Clock className="h-4 w-4" /> },
  unknown:        { label: "Sem resposta",       badge: "outline",     cls: "text-muted-foreground", icon: <AlertTriangle className="h-4 w-4" /> },
};

function ExternalIncidentsCard({ incidents }: { incidents: RadarSnapshot["externalIncidents"] }) {
  const sorted = [...incidents].sort((a, b) => {
    const order = ["major_outage", "partial_outage", "degraded", "maintenance", "unknown", "operational"];
    return order.indexOf(a.status) - order.indexOf(b.status);
  });
  const active = sorted.filter((i) => i.status !== "operational");
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">🚨 Serviços com incidentes</h2>
        <Badge variant={active.length > 0 ? "destructive" : "outline"}>
          {active.length} {active.length === 1 ? "com problema" : "com problemas"}
        </Badge>
      </div>
      <ul className="space-y-2">
        {sorted.map((it) => {
          const s = STATUS_STYLE[it.status] ?? STATUS_STYLE.unknown;
          return (
            <li key={it.provider} className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={s.cls}>{s.icon}</span>
                <div className="min-w-0">
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">
                    {it.provider}
                  </a>
                  <div className="text-[11px] text-muted-foreground truncate">{it.summary}</div>
                </div>
              </div>
              <Badge variant={s.badge} className={cn(it.status === "operational" && "text-success border-success/40")}>{s.label}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LatencyByRegionCard({ rows }: { rows: RadarSnapshot["byRegion"] }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-4">📡 Latência média por região (24h)</h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.code} className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg leading-none">{r.flag}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.city}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.country} · {r.samples} amostras</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-sm">{r.avgLatencyMs != null ? `${r.avgLatencyMs}ms` : "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {r.uptimePct != null ? `${r.uptimePct}% uptime` : "aguardando worker"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function UnstableCard({ rows }: { rows: RadarSnapshot["unstable"] }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-4 flex items-center gap-2">
        <Flame className="h-4 w-4 text-destructive" />
        Servidores mais instáveis (24h)
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma instabilidade relevante nas últimas 24 horas. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const body = (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    {r.host && <div className="text-[11px] text-muted-foreground font-mono truncate">{r.host}</div>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono text-destructive">{r.badPct}%</div>
                  <div className="text-[11px] text-muted-foreground">{r.bad}/{r.total} falhas</div>
                </div>
              </div>
            );
            return (
              <li key={`${r.name}-${i}`}>
                {r.slug ? <Link to="/status/$slug" params={{ slug: r.slug }} className="block hover:opacity-80">{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PlaceholderCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5 border-dashed">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{body}</p>
        </div>
      </div>
    </Card>
  );
}
