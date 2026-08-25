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
import { ArrowRight, Plus, ServerIcon, Bell, HeartPulse, Tv, AlertCircle, CreditCard } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubscription } from "@/hooks/use-subscription";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "up" | "down" | "degraded">("all");

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", u.user.id).maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  const { data: servers = [], refetch } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select(
          "id, name, description, category, current_status, last_latency_ms, last_checked_at, ssl_days_remaining, health_score, dns_health_score, is_public, public_slug, created_at, monitoring_paused",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const serverIds = useMemo(() => servers.map((s: any) => s.id), [servers]);

  const { data: alerts = [] } = useQuery({
    queryKey: ["dash-alerts", serverIds.join(",")],
    enabled: serverIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const nameById = new Map(servers.map((s: any) => [s.id, s.name]));
      const [dns, iptv, inc] = await Promise.all([
        supabase.from("dns_alerts").select("id, title, detail, severity, created_at, server_id").in("server_id", serverIds).order("created_at", { ascending: false }).limit(8),
        supabase.from("iptv_alerts").select("id, title, detail, severity, created_at, server_id").in("server_id", serverIds).order("created_at", { ascending: false }).limit(8),
        supabase.from("incidents").select("id, started_at, ended_at, reason, server_id").eq("incident_type", "server").in("server_id", serverIds).order("started_at", { ascending: false }).limit(8),
      ]);
      const items = [
        ...(dns.data ?? []).map((a: any) => ({ id: `dns-${a.id}`, kind: "DNS", title: a.title, detail: a.detail, at: a.created_at, severity: a.severity, server: nameById.get(a.server_id) })),
        ...(iptv.data ?? []).map((a: any) => ({ id: `iptv-${a.id}`, kind: "IPTV", title: a.title, detail: a.detail, at: a.created_at, severity: a.severity, server: nameById.get(a.server_id) })),
        ...(inc.data ?? []).map((a: any) => ({
          id: `inc-${a.id}`,
          kind: "Servidor",
          title: a.ended_at ? "Servidor voltou ao normal" : "Servidor instável / offline",
          detail: a.reason,
          at: a.started_at,
          severity: a.ended_at ? "info" : "critical",
          server: nameById.get(a.server_id),
        })),
      ];
      return items.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6);
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
      // Ocultar servidores pausados/sem serviço da lista principal de monitoramento
      if (s.monitoring_paused) return false;
      if (filter !== "all" && s.current_status !== filter) return false;
      if (query && !`${s.name} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [servers, filter, query]);

  const counts = useMemo(() => {
    const active = servers.filter(s => !s.monitoring_paused);
    return {
      total: active.length,
      up: active.filter((s) => s.current_status === "up").length,
      down: active.filter((s) => s.current_status === "down").length,
      degraded: active.filter((s) => s.current_status === "degraded").length,
    };
  }, [servers]);

  const health = useMemo(() => scoreOf(servers), [servers]);
  const iptvHealth = useMemo(() => {
    const list = servers.filter((s: any) => s.health_score != null);
    if (!list.length) return null;
    return Math.round(list.reduce((sum: number, s: any) => sum + s.health_score, 0) / list.length);
  }, [servers]);

  const firstName = (profile?.full_name || profile?.email || "").split(/[\s@]/)[0] || "";

  const { data: sub } = useSubscription();
  const isReseller = sub?.profile?.is_reseller;
  const credits = sub?.profile?.credits ?? 0;
  const isExpired = sub?.isExpired;

  return (
    <div className="space-y-6">
      {isReseller && credits === 0 && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-bold">⚠️ Seus créditos acabaram</span>
              <p className="text-xs text-muted-foreground">
                Seu painel continua acessível para recarga, mas seus monitoramentos próprios estão pausados e você não pode continuar criando novos clientes/revendas até adicionar créditos.
              </p>
            </div>
            <Link to="/app/reseller">
              <Button size="sm" className="shrink-0">
                <CreditCard className="h-3.5 w-3.5 mr-1" /> Adicionar Créditos
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {!isReseller && isExpired && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-bold">⚠️ Seu plano venceu</span>
              <p className="text-xs text-muted-foreground">
                Sua assinatura expirou. Renove para continuar utilizando o serviço e reativar seus monitoramentos.
              </p>
            </div>
            <Link to="/app/subscription">
              <Button size="sm" className="shrink-0">
                <ArrowRight className="h-3.5 w-3.5 mr-1" /> Renovar Agora
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Olá{firstName ? `, ${capitalize(firstName)}` : ""} 👋
          </h1>
          <p className="text-sm text-muted-foreground">Resumo dos seus servidores em tempo real.</p>
        </div>
        <Link to="/app/servers/new" className="w-full sm:w-auto"><Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1" />Novo servidor</Button></Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Resumo do monitoramento</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Summary emoji="✅" label="Monitorando" value={counts.up + counts.degraded + counts.down} tone="text-foreground" />
            <Summary emoji="🟢" label="Online" value={counts.up} tone="text-success" />
            <Summary emoji="🟡" label="Atenção" value={counts.degraded} tone="text-warning" />
            <Summary emoji="🔴" label="Offline" value={counts.down} tone="text-destructive" />
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-3">
            <HeartPulse className="h-3.5 w-3.5" /> Saúde geral
          </div>
          <div>
            <div className="flex items-end gap-2 mb-2">
              <span className={`text-4xl font-bold font-mono ${healthTone(health)}`}>{health}%</span>
              <span className="text-xs text-muted-foreground mb-1.5">{healthLabel(health)}</span>
            </div>
            <HealthBar value={health} />
            {iptvHealth != null && (
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Tv className="h-3.5 w-3.5" />IPTV Health Score</span>
                <span className={`font-mono font-semibold ${healthTone(iptvHealth)}`}>{iptvHealth}%</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Bell className="h-3.5 w-3.5" /> Últimos alertas
          </div>
          <Link to="/app/alerts" className="text-xs text-primary hover:underline">Configurar alertas</Link>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta recente. Tudo tranquilo por aqui ✨</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {alerts.map((a: any) => (
              <li key={a.id} className="py-2.5 flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-warning" : "bg-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{a.title}</span>
                    <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.server ? `${a.server} · ` : ""}{a.detail || "—"}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 rounded-md border border-border/60 bg-card/60 p-1 text-xs">
          {(["all", "up", "degraded", "down"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded ${filter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "Todos" : f === "up" ? "Online" : f === "degraded" ? "Atenção" : "Offline"}
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

function scoreOf(servers: any[]) {
  if (!servers.length) return 100;
  const total = servers.reduce((sum, s) => {
    const explicit = s.health_score ?? s.dns_health_score;
    if (explicit != null) return sum + explicit;
    return sum + (s.current_status === "up" ? 100 : s.current_status === "degraded" ? 60 : s.current_status === "down" ? 0 : 80);
  }, 0);
  return Math.round(total / servers.length);
}

function healthTone(v: number) {
  return v >= 90 ? "text-success" : v >= 70 ? "text-warning" : "text-destructive";
}
function healthLabel(v: number) {
  return v >= 90 ? "Excelente" : v >= 70 ? "Atenção" : "Crítico";
}

function HealthBar({ value }: { value: number }) {
  const filled = Math.round((value / 100) * 10);
  const tone = value >= 90 ? "bg-success" : value >= 70 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`h-2.5 flex-1 rounded-sm ${i < filled ? tone : "bg-muted/50"}`} />
      ))}
    </div>
  );
}

function Summary({ emoji, label, value, tone }: { emoji: string; label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{emoji} {label}</div>
      <div className={`text-3xl font-bold font-mono ${tone}`}>{value}</div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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

  const score = scoreOf([server]);

  return (
    <Link to="/app/servers/$id" params={{ id: server.id }}>
      <Card className="p-5 hover:border-primary/50 transition-colors group">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={server.current_status} />
              <h3 className="font-semibold truncate">{server.name}</h3>
            </div>
            <div className={`text-xs ${healthTone(score)}`}>Saúde {score}% · {healthLabel(score)}</div>
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
