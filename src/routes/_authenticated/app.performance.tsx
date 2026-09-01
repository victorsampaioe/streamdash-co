import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, Zap, ShieldCheck, Activity, Clock, TrendingUp } from "lucide-react";
import { getPerformanceRanking, type PerfRankingRow } from "@/lib/perf.functions";
import { classifyDelay, formatDelay, formatMs } from "@/lib/perf-thresholds";

export const Route = createFileRoute("/_authenticated/app/performance")({
  component: PerformancePage,
  head: () => ({
    meta: [
      { title: "Performance dos Servidores | Stream Monitor" },
      { name: "description", content: "Ranking de delay real, latência da Player API e estabilidade dos seus servidores IPTV." },
      { property: "og:title", content: "Performance dos Servidores | Stream Monitor" },
      { property: "og:description", content: "Compare o delay de abertura dos canais e a estabilidade de cada servidor monitorado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type SortKey = "delay" | "stability" | "api" | "health" | "slowest" | "recent";

const SORTS: { key: SortKey; label: string; icon: typeof Zap }[] = [
  { key: "delay", label: "Menor delay", icon: Zap },
  { key: "stability", label: "Melhor estabilidade", icon: ShieldCheck },
  { key: "api", label: "Menor latência da API", icon: Activity },
  { key: "health", label: "Melhor Health Score", icon: Gauge },
  { key: "slowest", label: "Maior delay", icon: TrendingUp },
  { key: "recent", label: "Atualizado recentemente", icon: Clock },
];

const MEDALS = ["🥇", "🥈", "🥉"];
const big = 9e9;

function since(ts: string | null): string {
  if (!ts) return "nunca testado";
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

function PerformancePage() {
  const [sort, setSort] = useState<SortKey>("delay");
  const fetchRanking = useServerFn(getPerformanceRanking);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["perf-ranking"],
    queryFn: () => fetchRanking(),
    refetchInterval: 120_000,
  });

  const sorted = useMemo(() => {
    const list = [...rows];
    const cmp: Record<SortKey, (a: PerfRankingRow, b: PerfRankingRow) => number> = {
      delay: (a, b) => (a.open_ms ?? big) - (b.open_ms ?? big),
      slowest: (a, b) => (b.open_ms ?? -1) - (a.open_ms ?? -1),
      api: (a, b) => (a.api_ms ?? big) - (b.api_ms ?? big),
      stability: (a, b) => Number(b.stability_pct ?? -1) - Number(a.stability_pct ?? -1),
      health: (a, b) => (b.health_score ?? -1) - (a.health_score ?? -1),
      recent: (a, b) =>
        new Date(b.last_measured_at ?? 0).getTime() - new Date(a.last_measured_at ?? 0).getTime(),
    };
    return list.sort(cmp[sort]);
  }, [rows, sort]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Gauge className="h-6 w-6 text-primary" /> Performance dos Servidores
        </h1>
        <p className="text-sm text-muted-foreground">
          Delay real de abertura dos canais (mediana dos últimos 7 dias), latência da Player API e estabilidade.
          Os testes rodam no backend — nenhuma credencial é exposta.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {SORTS.map((s) => (
          <Button key={s.key} size="sm" variant={sort === s.key ? "default" : "outline"} onClick={() => setSort(s.key)}>
            <s.icon className="h-4 w-4 mr-1" />
            {s.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Card className="p-12 text-center text-muted-foreground">Carregando ranking…</Card>
      ) : sorted.length === 0 ? (
        <Card className="p-12 text-center border-dashed text-sm text-muted-foreground">
          Nenhum servidor com medições ainda. Abra um servidor e use “Medir agora” na aba Performance.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r, i) => {
            const tier = classifyDelay(r.open_ms);
            const online = r.status === "up" || r.status === "degraded";
            return (
              <Card key={r.server_id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      <span>{MEDALS[i] ?? `#${i + 1}`}</span>
                      {r.name}
                    </div>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {online ? "🟢 Online" : "🔴 Offline"}
                    </Badge>
                  </div>
                  <span className={`text-sm font-semibold whitespace-nowrap ${tier.tone}`}>
                    {tier.emoji} {tier.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Delay real" value={formatDelay(r.open_ms)} strong />
                  <Field label="API" value={formatMs(r.api_ms)} />
                  <Field label="Estabilidade" value={r.stability_pct != null ? `${Number(r.stability_pct).toFixed(1)}%` : "—"} />
                  <Field label="Health Score" value={r.health_score != null ? `${r.health_score}/100` : "—"} />
                  <Field label="Delay 24h" value={formatDelay(r.open_ms_24h)} />
                  <Field label="Melhor / pior" value={`${formatDelay(r.open_best_ms)} / ${formatDelay(r.open_worst_ms)}`} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Último teste: {since(r.last_measured_at)}</span>
                  <Link to="/app/servers/$id" params={{ id: r.server_id }} className="text-primary hover:underline">
                    Detalhes
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono ${strong ? "text-lg font-semibold" : ""}`}>{value}</div>
    </div>
  );
}
