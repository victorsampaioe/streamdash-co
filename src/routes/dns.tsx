import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { Activity, Globe } from "lucide-react";

export const Route = createFileRoute("/dns")({
  head: () => ({
    meta: [
      { title: "DNS Monitoradas | StreamMonitor" },
      { name: "description", content: "Lista pública das DNS monitoradas em tempo real pelo StreamMonitor." },
      { property: "og:title", content: "DNS Monitoradas | StreamMonitor" },
      { property: "og:description", content: "Lista pública das DNS monitoradas em tempo real pelo StreamMonitor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicDnsList,
});

function PublicDnsList() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["public-dns-list"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_dns_list");
      return (data as Array<{ name: string; current_status: string; last_checked_at: string | null }>) ?? [];
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg">
      <header className="border-b border-border/60 backdrop-blur bg-background/70">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
          </Link>
          <span className="text-xs text-muted-foreground">Diretório público</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium mb-4">
            <Globe className="h-3.5 w-3.5" /> Monitoramento contínuo
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">DNS Monitoradas</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Lista pública das DNS monitoradas pelo StreamMonitor. Exibimos apenas o nome — endereços permanecem privados.
          </p>
        </div>

        <Card className="divide-y divide-border/60">
          {isLoading && <div className="p-6 text-sm text-muted-foreground text-center">Carregando...</div>}
          {!isLoading && rows.length === 0 && (
            <div className="p-10 text-sm text-muted-foreground text-center">Nenhuma DNS pública no momento.</div>
          )}
          {rows.map((r, i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <StatusDot status={r.current_status as any} />
                <span className="font-medium truncate">{r.name}</span>
              </div>
              <StatusLabel status={r.current_status as any} />
            </div>
          ))}
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          {rows.length} DNS monitorada{rows.length === 1 ? "" : "s"}
        </p>
      </main>
    </div>
  );
}
