import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/ranking")({
  component: RankingPage,
});

type Row = {
  name: string;
  avg_latency_ms: number;
  max_latency_ms: number;
  down_count: number;
  total_checks: number;
  instability_score: number;
};

function RankingPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["stability-ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stability_ranking", { _limit: 20 });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" /> Ranking de Instabilidade
        </h1>
        <p className="text-sm text-muted-foreground">
          Servidores mais instáveis nas últimas 24h. Exibimos apenas nome e latência — dono e host permanecem privados.
        </p>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center text-muted-foreground">Carregando ranking...</Card>
      ) : data.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sem dados suficientes nas últimas 24h.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium w-16">#</th>
                <th className="text-left p-3 font-medium">Servidor</th>
                <th className="text-right p-3 font-medium">Latência média</th>
                <th className="text-right p-3 font-medium">Latência máx</th>
                <th className="text-right p-3 font-medium">Falhas</th>
                <th className="text-right p-3 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const pct = r.total_checks > 0 ? (r.down_count / r.total_checks) * 100 : 0;
                const tone = pct > 20 ? "destructive" : pct > 5 ? "warning" : "default";
                return (
                  <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-right font-mono">{r.avg_latency_ms} ms</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{r.max_latency_ms} ms</td>
                    <td className="p-3 text-right">
                      <Badge variant={tone === "destructive" ? "destructive" : "outline"} className="font-mono">
                        {r.down_count}/{r.total_checks}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{r.instability_score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
