import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { UptimeSparkline } from "@/components/uptime-sparkline";
import { Card } from "@/components/ui/card";
import { GlobalCheckMap } from "@/components/global-check-map";


export const Route = createFileRoute("/status/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Status — ${params.slug} | StreamMonitor` },
      { name: "description", content: "Página pública de status do servidor." },
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

            <Card className="p-6 mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
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
      <footer className="max-w-3xl mx-auto px-6 py-6 text-center text-xs text-muted-foreground">
        Powered by <a href="/" className="text-primary hover:underline">streammonitor.site</a>
      </footer>
    </div>
  );
}
