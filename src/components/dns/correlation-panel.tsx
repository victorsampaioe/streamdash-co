import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type Overview = {
  group: string;
  total: number;
  online: number;
  offline: number;
  degraded: number;
  verdict: "healthy" | "isolated" | "partial" | "server_down";
  dns: Array<{ id: string; name: string; status: string; latency_ms: number | null; checked_at: string | null; is_current: boolean }>;
};

type EventRow = {
  id: string;
  verdict: string;
  confidence: number;
  online_count: number;
  offline_count: number;
  total_count: number;
  summary: string | null;
  created_at: string;
  recovered_at: string | null;
  recovery_seconds: number | null;
};

const VERDICT_UI: Record<string, { label: string; cls: string; icon: React.ReactNode; text: string }> = {
  healthy: {
    label: "Tudo estável", cls: "text-success border-success/40 bg-success/10",
    icon: <CheckCircle2 className="h-4 w-4" />, text: "Todas as DNS vinculadas a este servidor estão respondendo.",
  },
  isolated: {
    label: "Falha isolada", cls: "text-success border-success/40 bg-success/10",
    icon: <AlertTriangle className="h-4 w-4" />, text: "Detectamos uma falha isolada na DNS. O servidor principal continua online.",
  },
  partial: {
    label: "Instabilidade parcial", cls: "text-warning border-warning/40 bg-warning/10",
    icon: <AlertTriangle className="h-4 w-4" />, text: "Detectamos instabilidade parcial no servidor. Algumas conexões apresentam falha.",
  },
  server_down: {
    label: "Queda real do servidor", cls: "text-destructive border-destructive/40 bg-destructive/10",
    icon: <XCircle className="h-4 w-4" />, text: "Possível indisponibilidade do servidor. Todas as DNS vinculadas apresentam falha.",
  },
};

function fmtDuration(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function CorrelationPanel({ serverId }: { serverId: string }) {
  const { data: overview } = useQuery({
    queryKey: ["correlation-overview", serverId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_correlation_overview", { _server_id: serverId });
      return (data ?? null) as Overview | null;
    },
    refetchInterval: 60_000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["correlation-events", serverId],
    queryFn: async () =>
      ((await supabase
        .from("dns_correlation_events")
        .select("id, verdict, confidence, online_count, offline_count, total_count, summary, created_at, recovered_at, recovery_seconds")
        .eq("server_id", serverId)
        .order("created_at", { ascending: false })
        .limit(15)).data ?? []) as EventRow[],
  });

  if (!overview) return null;
  const ui = VERDICT_UI[overview.verdict] ?? VERDICT_UI.healthy!;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Network className="h-4 w-4" /> Análise de correlação
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Servidor <strong className="text-foreground">{overview.group}</strong> · {overview.total} DNS monitorada{overview.total === 1 ? "" : "s"}
          </p>
        </div>
        <Badge variant="outline" className={`gap-1 ${ui.cls}`}>{ui.icon}{ui.label}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Monitoradas" value={overview.total} />
        <Metric label="Online" value={overview.online} cls="text-success" />
        <Metric label="Offline" value={overview.offline} cls="text-destructive" />
      </div>

      <p className="text-sm text-muted-foreground">{ui.text}</p>

      <ul className="space-y-1.5">
        {overview.dns.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm border-t border-border/40 pt-1.5">
            <span className="truncate">
              {d.status === "up" ? "✅" : d.status === "down" ? "❌" : "⚠️"} {d.name}
              {d.is_current && <span className="text-[11px] text-muted-foreground ml-1">(atual)</span>}
            </span>
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              {d.latency_ms != null ? `${d.latency_ms}ms` : "—"}
            </span>
          </li>
        ))}
      </ul>

      {overview.total === 1 && (
        <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
          Dica: informe o mesmo <strong>Servidor (agrupamento)</strong> nas outras DNS deste painel para ativar a correlação inteligente.
        </p>
      )}

      {events.length > 0 && (
        <div className="border-t border-border/40 pt-3 space-y-2">
          <h5 className="text-xs font-medium text-muted-foreground">Histórico de diagnósticos</h5>
          <ul className="space-y-2">
            {events.map((e) => {
              const eui = VERDICT_UI[e.verdict] ?? VERDICT_UI.healthy!;
              return (
                <li key={e.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={eui.cls.split(" ")[0]}>{eui.label}</span>
                    <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {e.offline_count}/{e.total_count} DNS offline · confiança {e.confidence}% ·{" "}
                    {e.recovered_at ? `recuperado em ${fmtDuration(e.recovery_seconds)}` : "em curso"}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${cls ?? ""}`}>{value}</div>
    </div>
  );
}
