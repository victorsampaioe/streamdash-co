import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Gauge, RefreshCw, Loader2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { getServerPerfHistory, runPerfTestNow } from "@/lib/perf.functions";
import { classifyDelay, formatDelay, formatMs } from "@/lib/perf-thresholds";

const STATE_LABEL: Record<string, string> = {
  ok: "Online",
  timeout: "Timeout",
  stream_unavailable: "Stream indisponível",
  offline: "Servidor offline",
  error: "Erro",
};

export function PerfPanel({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const history = useServerFn(getServerPerfHistory);
  const runTest = useServerFn(runPerfTestNow);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["perf-history", serverId],
    queryFn: () => history({ data: { serverId, limit: 50 } }),
    refetchInterval: 120_000,
  });

  const test = useMutation({
    mutationFn: () => runTest({ data: { serverId } }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "warning"](
        r.ok
          ? `Delay medido: ${formatDelay(r.open_ms)} (API ${formatMs(r.api_ms)})`
          : `Teste concluído: ${STATE_LABEL[r.state] ?? r.state}`,
      );
      qc.invalidateQueries({ queryKey: ["perf-history", serverId] });
      qc.invalidateQueries({ queryKey: ["perf-ranking"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no teste de performance"),
  });

  const oks = rows.filter((r) => r.ok && r.open_ms != null);
  const sorted = [...oks].map((r) => r.open_ms!).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
  const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
  const apiMedian = (() => {
    const a = oks.map((r) => r.api_ms).filter((v): v is number => v != null).sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)]! : null;
  })();
  const tier = classifyDelay(median);
  const chart = [...oks].reverse().map((r) => ({
    t: new Date(r.measured_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    delay: r.open_ms,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" /> Performance real
          </h3>
          <p className="text-xs text-muted-foreground">
            Latência da Player API e tempo de abertura de canais medidos pelo backend.
          </p>
        </div>
        <Button size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Medir agora
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Delay típico (mediana)" value={formatDelay(median)} />
        <Stat label="Delay médio" value={formatDelay(avg)} />
        <Stat label="Latência API" value={formatMs(apiMedian)} />
        <Stat label="Melhor / pior" value={sorted.length ? `${formatDelay(sorted[0])} / ${formatDelay(sorted[sorted.length - 1])}` : "—"} />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm">
          Classificação atual:
          <span className={`font-semibold ${tier.tone}`}>
            {tier.emoji} {tier.label}
          </span>
        </div>
      </Card>

      {chart.length > 1 && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-3">Evolução do delay de abertura</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="ms" width={54} />
                <Tooltip formatter={(v: any) => formatDelay(Number(v))} />
                <Line type="monotone" dataKey="delay" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Medição</th>
              <th className="text-right p-3 font-medium">API</th>
              <th className="text-right p-3 font-medium">Abertura</th>
              <th className="text-right p-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhuma medição ainda. Clique em “Medir agora”.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="p-3">{new Date(r.measured_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 text-right font-mono">{formatMs(r.api_ms)}</td>
                <td className="p-3 text-right font-mono">{formatDelay(r.open_ms)}</td>
                <td className="p-3 text-right">
                  <Badge variant={r.ok ? "outline" : "destructive"} className="text-[10px]">
                    {STATE_LABEL[r.state] ?? r.state}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </Card>
  );
}
