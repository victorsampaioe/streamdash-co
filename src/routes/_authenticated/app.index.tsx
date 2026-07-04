import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import { UptimeSparkline } from "@/components/uptime-sparkline";
import { SearchInput } from "@/components/app-shell";
import { ArrowRight, Plus, ServerIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "up" | "down" | "degraded">("all");

  const { data: servers = [], refetch } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel("dash-servers")
      .on("postgres_changes", { event: "*", schema: "public", table: "servers" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "checks" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      if (filter !== "all" && s.current_status !== filter) return false;
      if (query && !`${s.name} ${s.host}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [servers, filter, query]);

  const counts = useMemo(() => ({
    total: servers.length,
    up: servers.filter((s) => s.current_status === "up").length,
    down: servers.filter((s) => s.current_status === "down").length,
    degraded: servers.filter((s) => s.current_status === "degraded").length,
  }), [servers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Estado atual da sua infraestrutura em tempo real.</p>
        </div>
        <Link to="/app/servers/new"><Button><Plus className="h-4 w-4 mr-1" />Novo servidor</Button></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Servidores" value={counts.total} tone="muted" />
        <StatCard label="Online" value={counts.up} tone="success" />
        <StatCard label="Degradado" value={counts.degraded} tone="warning" />
        <StatCard label="Offline" value={counts.down} tone="destructive" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 rounded-md border border-border/60 bg-card/60 p-1 text-xs">
          {(["all", "up", "degraded", "down"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded ${filter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "Todos" : f === "up" ? "Online" : f === "degraded" ? "Degradado" : "Offline"}
            </button>
          ))}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar servidor..." />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <ServerIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">Nenhum servidor cadastrado.</p>
          <Link to="/app/servers/new"><Button>Cadastrar primeiro servidor</Button></Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <ServerCard key={s.id} server={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "muted" | "success" | "destructive" | "warning" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className={`text-3xl font-bold font-mono ${toneCls}`}>{value}</div>
    </Card>
  );
}

function ServerCard({ server }: { server: any }) {
  const { data: recent = [] } = useQuery({
    queryKey: ["recent-checks", server.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("checks")
        .select("status, checked_at, latency_ms")
        .eq("server_id", server.id)
        .order("checked_at", { ascending: false })
        .limit(40);
      return (data ?? []).reverse();
    },
    refetchInterval: 15000,
  });

  return (
    <Link to="/app/servers/$id" params={{ id: server.id }}>
      <Card className="p-5 hover:border-primary/50 transition-colors group">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={server.current_status} />
              <h3 className="font-semibold truncate">{server.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{server.host}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="text-muted-foreground">
            Latência: <span className="font-mono text-foreground">{server.last_latency_ms ?? "—"} ms</span>
          </span>
          {server.ssl_days_remaining != null && (
            <Badge variant="outline" className="font-mono">SSL {server.ssl_days_remaining}d</Badge>
          )}
        </div>
        <UptimeSparkline checks={recent} />
      </Card>
    </Link>
  );
}
