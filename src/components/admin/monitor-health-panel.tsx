import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Globe, RefreshCw, ServerCrash, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMonitorHealth, runMonitorSweepNow } from "@/lib/monitor-health.functions";

function fmt(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR");
}

export function MonitorHealthPanel() {
  const fetchHealth = useServerFn(getMonitorHealth);
  const sweepNow = useServerFn(runMonitorSweepNow);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["monitor-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60_000,
  });

  const sweep = useMutation({
    mutationFn: () => sweepNow(),
    onSuccess: (r: any) => {
      toast.success(
        `Varredura concluída: ${r.processed} verificados, ${r.fixed} corrigidos, ${r.requeued} reenfileirados`,
      );
      void qc.invalidateQueries({ queryKey: ["monitor-health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha na varredura"),
  });

  const c = data?.counts;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              Saúde do monitoramento
            </CardTitle>
            <CardDescription>
              Estado do DNS e do servidor são independentes: DNS com falha não marca o servidor como offline.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
            <RefreshCw className={`size-4 ${sweep.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
            Varredura agora
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Monitorados", value: c?.total, icon: Activity },
            { label: "Servidor offline", value: c?.serverDown, icon: ServerCrash },
            { label: "Servidor instável", value: c?.serverDegraded, icon: Activity },
            { label: "DNS offline", value: c?.dnsOffline, icon: Globe },
            { label: "Só DNS com falha", value: c?.dnsOnlyProblem, icon: Globe },
            { label: "Sem checagem 15min", value: c?.stale, icon: TimerReset },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {isLoading ? "—" : (k.value ?? 0)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Servidores esquecidos na fila</CardTitle>
          <CardDescription>Sem verificação há mais de 15 minutos — reenfileirados na próxima varredura.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.stale.length ? (
            <p className="text-sm text-muted-foreground">Nenhum servidor atrasado. Fila saudável.</p>
          ) : (
            data.stale.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="font-mono text-sm">{s.host}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">servidor: {s.current_status ?? "?"}</Badge>
                  <Badge variant="outline">dns: {s.dns_status ?? "?"}</Badge>
                  <span className="text-xs text-muted-foreground">{fmt(s.last_checked_at)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoria de varreduras</CardTitle>
          <CardDescription>Cada ciclo de reconciliação com progresso e correções aplicadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.sweeps.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma varredura registrada ainda.</p>
          ) : (
            data.sweeps.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span className="text-muted-foreground">{fmt(s.started_at)}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.errors ? "destructive" : "secondary"}>{s.status}</Badge>
                  <span>{s.processed}/{s.total} verificados</span>
                  <span>{s.offline_found} offline</span>
                  <span>{s.fixed} corrigidos</span>
                  <span>{s.requeued} reenfileirados</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
