import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ShieldCheck, Clock, Gauge } from "lucide-react";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { UptimeSparkline } from "@/components/uptime-sparkline";
import { Card } from "@/components/ui/card";
import { GlobalCheckMap } from "@/components/global-check-map";


export const Route = createFileRoute("/status/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Status do serviço — ${params.slug} | StreamMonitor` },
      { name: "description", content: "Página pública de status em tempo real: disponibilidade, latência, certificado SSL e último incidente registrado." },
      { property: "og:title", content: `Status do serviço — ${params.slug}` },
      { property: "og:description", content: "Disponibilidade em tempo real, latência e histórico de incidentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicStatus,
});

function PublicStatus() {
  const { slug } = Route.useParams();
  const { data: server, isLoading } = useQuery({
    queryKey: ["public-server", slug],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_status", { _slug: slug });
      return (data as any[])?.[0] ?? null;
    },
    refetchInterval: 20000,
  });

  const { data: checks = [] } = useQuery({
    enabled: !!server?.id,
    queryKey: ["public-checks", slug],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_checks", { _slug: slug, _limit: 60 });
      return (data as any[]) ?? [];
    },
    refetchInterval: 20000,
  });

  const upCount = checks.filter((c: any) => c.status === "up").length;
  const uptimePct = checks.length ? (upCount / checks.length) * 100 : null;
  const lastIncident = checks.find((c: any) => c.status !== "up") ?? null;
  const allGood = server?.current_status === "up";

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg">
      <header className="border-b border-border/60 backdrop-blur bg-background/70">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
          </div>
          <span className="text-xs text-muted-foreground">Página pública</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {!isLoading && !server && (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground">Página não encontrada ou tornada privada.</p>
          </Card>
        )}
        {server && (
          <>
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-3 mb-3">
                <StatusDot status={server.current_status} className="h-4 w-4" />
                <h1 className="text-3xl font-bold tracking-tight">{server.name}</h1>
              </div>
              <StatusLabel status={server.current_status} />
              {server.description && <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">{server.description}</p>}
            </div>

            <Card
              className={`p-6 mb-6 text-center border ${allGood ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}
            >
              <div className="text-2xl sm:text-3xl font-bold tracking-tight">
                {allGood ? "🟢 Todos os serviços funcionando" : "🔴 Instabilidade detectada"}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {lastIncident
                  ? `Último incidente: ${new Date(lastIncident.checked_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : "Nenhum incidente registrado no período monitorado."}
              </p>
            </Card>

            <Card className="p-6 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Estado</div>
                  <div className="text-lg font-semibold"><StatusLabel status={server.current_status} /></div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Latência</div>
                  <div className="text-lg font-semibold font-mono">{server.last_latency_ms ?? "—"}ms</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">SSL</div>
                  <div className="text-lg font-semibold font-mono">{server.ssl_days_remaining != null ? `${server.ssl_days_remaining}d` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Disponibilidade</div>
                  <div className="text-lg font-semibold font-mono">{uptimePct != null ? `${uptimePct.toFixed(1)}%` : "—"}</div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm font-medium mb-4">Últimos 60 checks</h3>
              <UptimeSparkline checks={[...checks].reverse()} />
              <p className="text-xs text-muted-foreground mt-3">
                Última verificação: {server.last_checked_at ? new Date(server.last_checked_at).toLocaleString() : "—"}
              </p>
            </Card>

            <div className="mt-6">
              <GlobalCheckMap serverId={server.id} />
            </div>

          </>
        )}
      </main>
      <footer className="max-w-3xl mx-auto px-6 py-8 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-4 mb-3">
          <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-primary" />Checagem a cada 30s</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" />Atualização automática</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" />Monitorado 24/7</span>
        </div>
        Powered by <a href="/" className="text-primary hover:underline">streammonitor.site</a>
      </footer>
    </div>
  );
}
