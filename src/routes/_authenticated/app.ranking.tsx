import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, AlertTriangle, Library, Zap, ShieldCheck, Tv, Film, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/ranking")({
  component: RankingPage,
});

type IptvRow = {
  server_id: string;
  name: string;
  health_score: number;
  channels: number | null;
  movies: number | null;
  series: number | null;
  categories: number | null;
  latency_ms: number | null;
  api_ms: number | null;
  synced_at: string;
  is_mine: boolean;
};

type StabilityRow = {
  name: string;
  avg_latency_ms: number;
  max_latency_ms: number;
  down_count: number;
  total_checks: number;
  instability_score: number;
};

type Filter = "complete" | "fast" | "stable";

const FILTERS: { key: Filter; label: string; icon: typeof Library; hint: string }[] = [
  { key: "stable", label: "Mais estável", icon: ShieldCheck, hint: "Ordenado pelo IPTV Health Score" },
  { key: "complete", label: "Mais completo", icon: Library, hint: "Ordenado por canais + filmes + séries" },
  { key: "fast", label: "Mais rápido", icon: Zap, hint: "Ordenado pela menor latência" },
];

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const content = (r: IptvRow) => (r.channels ?? 0) + (r.movies ?? 0) + (r.series ?? 0);

function RankingPage() {
  const [filter, setFilter] = useState<Filter>("stable");

  const { data: iptv = [], isLoading } = useQuery({
    queryKey: ["iptv-ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_iptv_ranking", { _limit: 100 });
      if (error) throw error;
      return (data ?? []) as IptvRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: stability = [] } = useQuery({
    queryKey: ["stability-ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stability_ranking", { _limit: 10 });
      if (error) throw error;
      return (data ?? []) as StabilityRow[];
    },
    refetchInterval: 60_000,
  });

  const avg = useMemo(() => {
    if (!iptv.length) return null;
    const sum = (f: (r: IptvRow) => number) => iptv.reduce((a, r) => a + f(r), 0);
    return {
      health: Math.round(sum((r) => r.health_score) / iptv.length),
      channels: Math.round(sum((r) => r.channels ?? 0) / iptv.length),
      movies: Math.round(sum((r) => r.movies ?? 0) / iptv.length),
      series: Math.round(sum((r) => r.series ?? 0) / iptv.length),
      content: Math.round(sum(content) / iptv.length),
    };
  }, [iptv]);

  const rows = useMemo(() => {
    const list = [...iptv];
    if (filter === "complete") list.sort((a, b) => content(b) - content(a));
    else if (filter === "fast") list.sort((a, b) => (a.latency_ms ?? 9e9) - (b.latency_ms ?? 9e9));
    else list.sort((a, b) => b.health_score - a.health_score || content(b) - content(a));
    return list;
  }, [iptv, filter]);

  const mine = rows.findIndex((r) => r.is_mine);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" /> Ranking IPTV Inteligente
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparativo dos servidores que passaram na validação da Player API nas últimas 48h. Exibimos apenas nome,
          conteúdo e desempenho — host, credenciais e dono permanecem privados.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            title={f.hint}
          >
            <f.icon className="h-4 w-4 mr-1" />
            {f.label}
          </Button>
        ))}
      </div>

      {avg && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Servidores validados" value={num(iptv.length)} icon={<ShieldCheck className="h-4 w-4" />} />
          <Stat label="Health Score médio" value={`${avg.health}%`} icon={<Trophy className="h-4 w-4" />} />
          <Stat label="Canais (média)" value={num(avg.channels)} icon={<Tv className="h-4 w-4" />} />
          <Stat label="Filmes (média)" value={num(avg.movies)} icon={<Film className="h-4 w-4" />} />
          <Stat label="Séries (média)" value={num(avg.series)} icon={<Layers className="h-4 w-4" />} />
        </div>
      )}

      {mine >= 0 && avg && (
        <Card className="p-5 border-primary/40 bg-primary/5">
          <p className="text-sm">
            Seu servidor <strong>{rows[mine]!.name}</strong> está em{" "}
            <strong className="text-primary">#{mine + 1} de {rows.length}</strong> servidores neste filtro
            {avg.content > 0 && (
              <>
                {" "}e tem{" "}
                <strong>
                  {Math.round((content(rows[mine]!) / avg.content - 1) * 100)}%
                </strong>{" "}
                de conteúdo em relação à média da plataforma.
              </>
            )}
          </p>
        </Card>
      )}

      {isLoading ? (
        <Card className="p-12 text-center text-muted-foreground">Carregando ranking...</Card>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum servidor validado nas últimas 48h. Execute uma sincronização IPTV para entrar no ranking.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium w-14">#</th>
                <th className="text-left p-3 font-medium">Servidor</th>
                <th className="text-right p-3 font-medium">Health</th>
                <th className="text-right p-3 font-medium">Canais</th>
                <th className="text-right p-3 font-medium">Filmes</th>
                <th className="text-right p-3 font-medium">Séries</th>
                <th className="text-right p-3 font-medium">Latência</th>
                <th className="text-right p-3 font-medium">Player API</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.server_id}
                  className={`border-t border-border/60 hover:bg-muted/30 ${r.is_mine ? "bg-primary/5" : ""}`}
                >
                  <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">
                    {r.name}
                    {r.is_mine && <Badge variant="outline" className="ml-2 text-[10px]">Seu servidor</Badge>}
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className={`font-mono font-semibold ${r.health_score >= 70 ? "text-success" : r.health_score >= 50 ? "text-warning" : "text-destructive"}`}
                    >
                      {r.health_score}%
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">{num(r.channels)}</td>
                  <td className="p-3 text-right font-mono">{num(r.movies)}</td>
                  <td className="p-3 text-right font-mono">{num(r.series)}</td>
                  <td className="p-3 text-right font-mono">{r.latency_ms != null ? `${r.latency_ms} ms` : "—"}</td>
                  <td className="p-3 text-right font-mono text-muted-foreground">
                    {r.api_ms != null ? `${r.api_ms} ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {stability.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" /> Ranking de Instabilidade (24h)
          </h2>
          <Card className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium w-14">#</th>
                  <th className="text-left p-3 font-medium">Servidor</th>
                  <th className="text-right p-3 font-medium">Latência média</th>
                  <th className="text-right p-3 font-medium">Falhas</th>
                  <th className="text-right p-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {stability.map((r, i) => (
                  <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-right font-mono">{r.avg_latency_ms} ms</td>
                    <td className="p-3 text-right">
                      <Badge variant="outline" className="font-mono">
                        {r.down_count}/{r.total_checks}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{r.instability_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold font-mono">{value}</div>
    </Card>
  );
}
