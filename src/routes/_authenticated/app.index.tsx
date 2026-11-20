import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import { UptimeSparkline } from "@/components/uptime-sparkline";
import { SearchInput } from "@/components/app-shell";
import { ArrowRight, Plus, ServerIcon, HeartPulse, Tv, AlertCircle, CreditCard, RadioTower, Activity, Wifi, WifiOff, ChevronRight, Gauge, Globe2, Clock3 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubscription } from "@/hooks/use-subscription";
import { getAnnualPromo } from "@/lib/annual-promo.functions";
import { formatBRL } from "@/lib/payments";
import { effectiveAccessStatus, accessStatusLabel, isHttpCheckStale, dnsDisplayState, isDnsCheckStale } from "@/lib/dns-state";

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
          "id, name, description, category, current_status, last_latency_ms, last_checked_at, ssl_days_remaining, health_score, dns_health_score, dns_status, dns_enabled, last_dns_check_at, is_public, public_slug, created_at, monitoring_paused",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
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
      if (filter !== "all" && effectiveAccessStatus(s) !== filter) return false;
      if (query && !`${s.name} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [servers, filter, query]);

  const counts = useMemo(() => {
    const active = servers.filter(s => !s.monitoring_paused);
    return {
      total: active.length,
      up: active.filter((s) => effectiveAccessStatus(s) === "up").length,
      down: active.filter((s) => effectiveAccessStatus(s) === "down").length,
      degraded: active.filter((s) => effectiveAccessStatus(s) === "degraded").length,
      unknown: active.filter((s) => effectiveAccessStatus(s) === "unknown").length,
    };
  }, [servers]);

  const freshForHealth = useMemo(() => servers.filter(s => !s.monitoring_paused && !isHttpCheckStale(s)), [servers]);
  const health = useMemo(() => freshForHealth.length ? scoreOf(freshForHealth) : null, [freshForHealth]);
  const healthReliable = freshForHealth.length > 0 && freshForHealth.length >= counts.total * 0.8;
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
  const readAnnualPromo = useServerFn(getAnnualPromo);
  const { data: annualPromo } = useQuery({
    queryKey: ["annual-promo-20261119"],
    queryFn: () => readAnnualPromo(),
    enabled: !!sub,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return (
    <div className="space-y-6">
      {annualPromo && (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border-2 border-amber-400/70 bg-gradient-to-r from-amber-400/20 to-orange-600/10 p-5">
          <div className="space-y-1">
            <div className="text-xs font-extrabold uppercase tracking-wide text-amber-500">🔥 Promoção relâmpago — somente hoje até 23h59</div>
            <h2 className="text-xl font-black">Plano anual Stream Monitor por {formatBRL(annualPromo.priceCents)}</h2>
            <p className="text-sm text-muted-foreground">Oferta para todos os clientes e revendedores, inclusive com assinatura expirada.</p>
          </div>
          <Link to="/app/subscription" className="shrink-0"><Button className="w-full sm:w-auto">Aproveitar com Pix <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
        </Card>
      )}
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


      <section className="relative isolate overflow-hidden rounded-[28px] border border-blue-500/25 bg-[#08162c] p-5 text-white shadow-[0_25px_70px_-45px_rgba(25,100,255,.65)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-blue-500/25 blur-[90px]" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Stream Monitor · Command Center
            </div>
            <h1 className="text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">Sua operação sob <span className="text-blue-400">controle.</span></h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
              {firstName ? "Bem-vindo, " + capitalize(firstName) + ". " : ""}Monitore DNS, disponibilidade e incidentes com informações organizadas em tempo real.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><Activity className="mr-1.5 inline h-3.5 w-3.5 text-blue-400" />Monitorando <b className="text-white">{counts.total}</b></span>
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><HeartPulse className="mr-1.5 inline h-3.5 w-3.5 text-blue-400" />Saúde geral <b className="text-white">{healthReliable ? `${health}%` : "Dados insuficientes"}</b></span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Link to="/app/servers/new" className="flex-1"><Button size="lg" className="h-12 w-full rounded-xl bg-blue-500 px-5 font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-400"><Plus className="mr-2 h-4 w-4" />Adicionar servidor</Button></Link>
            <Link to="/app/central" className="flex-1"><Button size="lg" variant="outline" className="h-12 w-full rounded-xl border-blue-300/30 bg-blue-300/10 px-5 text-white hover:bg-blue-500/20 hover:text-white"><RadioTower className="mr-2 h-4 w-4" />Abrir Sentinel Edge <ChevronRight className="ml-2 h-4 w-4" /></Button></Link>
          </div>
        </div>
      </section>

      <section aria-label="Resumo de monitoramento" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Monitorando", value: counts.total, icon: ServerIcon, accent: "text-blue-400", bg: "bg-blue-500/10", line: "bg-blue-500", detail: "Servidores ativos" },
          { label: "Online", value: counts.up, icon: Wifi, accent: "text-emerald-400", bg: "bg-emerald-500/10", line: "bg-emerald-500", detail: "Em funcionamento" },
          { label: "Atenção", value: counts.degraded, icon: Activity, accent: "text-amber-400", bg: "bg-amber-500/10", line: "bg-amber-500", detail: "Precisam de análise" },
          { label: "Offline", value: counts.down, icon: WifiOff, accent: "text-red-400", bg: "bg-red-500/10", line: "bg-red-500", detail: "Falhas identificadas" },
          { label: "Sem dados recentes", value: counts.unknown, icon: AlertCircle, accent: "text-slate-400", bg: "bg-slate-500/10", line: "bg-slate-500", detail: "HTTP atrasado ou sem confirmação" },
        ].map((item) => (
          <Card key={item.label} className="relative overflow-hidden rounded-2xl border-border/60 p-4 sm:p-5">
            <span className={"absolute inset-x-0 top-0 h-[2px] " + item.line} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " + item.bg + " " + item.accent}><item.icon className="h-4 w-4" /></span>
            </div>
            <div className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">{item.value}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
          </Card>
        ))}
      </section>

      <div className="grid gap-4">
        <Card className="relative overflow-hidden rounded-2xl border-border/70 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saúde da infraestrutura</div><p className="mt-1 text-xs text-muted-foreground">Indicadores consolidados da operação</p></div>
            <HeartPulse className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-3">
            <span className={"text-5xl font-extrabold tracking-tighter tabular-nums " + (healthReliable && health != null ? healthTone(health) : "text-amber-400")}>{healthReliable ? `${health}%` : "—"}</span>
            <span className="text-sm text-muted-foreground">{healthReliable && health != null ? healthLabel(health) : "Dados insuficientes para calcular saúde geral"}</span>
          </div>
          <div className="mt-5">{healthReliable && health != null ? <HealthBar value={health} /> : <p className="text-xs text-amber-400">Há muitos servidores sem verificação HTTP recente. Não é possível afirmar que a saúde geral está boa.</p>}</div>
          {iptvHealth != null && (
            <div className="mt-5 flex items-center justify-between rounded-xl border border-border/60 bg-muted/25 px-3 py-3 text-xs">
              <span className="inline-flex items-center gap-2 text-muted-foreground"><Tv className="h-4 w-4 text-blue-400" />IPTV Health Score</span>
              <strong className={healthTone(iptvHealth)}>{iptvHealth}%</strong>
            </div>
          )}
        </Card>
      </div>

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 sm:gap-5">
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
    if (s.dns_enabled !== false && !isDnsCheckStale(s) && s.dns_status === "offline") return sum;
    if (s.dns_enabled !== false && !isDnsCheckStale(s) && s.dns_status === "unstable") return sum + Math.min(explicit ?? 60, 60);
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
      <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2"><span className="text-base">{emoji}</span> {label}</div>
      <div className={`text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${tone}`}>{value}</div>
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


function LatencyTrend({ checks, color, source = "HTTP" }: {
  checks: Array<{ status: string; checked_at: string; latency_ms: number | null }>;
  color: string;
  source?: "HTTP" | "DNS";
}) {
  const values = checks.filter(c => c.latency_ms != null &&
    Number.isFinite(c.latency_ms) && c.latency_ms >= 0).slice(-16).map(c => Number(c.latency_ms));
  if (values.length < 3) return null;
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 15);
  const points = values.map((v, i) => [4 + 152 * i / (values.length - 1), 37 - 27 * (v - min) / span]);
  const line = points.map(([x,y],i) => (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1)).join(" ");
  return <svg viewBox="0 0 160 48" fill="none" role="img" aria-label={`Tendência real de latência ${source}`}
    className="h-10 w-24 shrink-0 opacity-80 sm:w-32" preserveAspectRatio="none">
    <path d={line + " L156,45 L4,45 Z"} fill={color} opacity=".12"/>
    <path d={line} stroke={color} strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="2.5" fill={color}/>
  </svg>;
}
function ServerCard({ server }: { server: any }) {
  const { data: recent = [] } = useQuery({
    queryKey: ["recent-checks", server.id],
    queryFn: async () => {
      const { data } = await supabase.from("checks")
        .select("status, checked_at, latency_ms")
        .eq("server_id", server.id)
        .order("checked_at", { ascending: false }).limit(40);
      return (data ?? []).reverse();
    },
    refetchInterval: 15000,
  });
  // HTTP checks stopped updating after the monitoring migration. Cloudflare D1
  // continues recording real DNS history, so show that as a DISTINCT source
  // rather than drawing fake HTTP uptime bars.
  type HistoryPoint = {status: string; checked_at: string; latency_ms: number | null};
  const { data: dnsRecent = [] } = useQuery<HistoryPoint[]>({
    queryKey: ["cloudflare-dns-history", server.id],
    enabled: !server.monitoring_paused && server.dns_enabled !== false,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getSession();
      const accessToken = auth.session?.access_token;
      const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!accessToken || !publicKey) return [];
      const response = await fetch(
        "https://streammonitor-dns-history.victorsampaio133.workers.dev/v1/history?serverId="
          + encodeURIComponent(String(server.id)),
        {
          headers: { Authorization: `Bearer ${accessToken}`, "x-sm-public-key": publicKey },
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return [];
      const result: unknown = await response.json();
      const items = (result as {items?: unknown})?.items;
      if (!Array.isArray(items)) return [];
      return items.filter((item: any): item is HistoryPoint =>
        item && ["up", "down", "degraded", "unknown"].includes(item.status)
        && typeof item.checked_at === "string"
        && Number.isFinite(Date.parse(item.checked_at))
        && (item.latency_ms === null || (typeof item.latency_ms === "number" && Number.isFinite(item.latency_ms)))
      ).slice(-40);
    },
    staleTime: 120000,
    refetchInterval: 180000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const httpLastChecked = recent.length ? Date.parse(recent[recent.length - 1].checked_at) : NaN;
  const httpFresh = Number.isFinite(httpLastChecked) && Date.now() - httpLastChecked < 60 * 60 * 1000;
  const hasDnsHistory = dnsRecent.length > 0;
  const displayedChecks = httpFresh ? recent : hasDnsHistory ? dnsRecent : recent;
  const sparkSource = httpFresh ? "HTTP" : hasDnsHistory ? "DNS" : recent.length ? "HTTP antigo" : null;
  const delayed = isHttpCheckStale(server);
  const status = effectiveAccessStatus(server);
  const score = scoreOf([server]);
  const dns = dnsDisplayState(server);
  const danger = !delayed && (status === "down" || score < 70);
  const caution = !danger && (delayed || status === "degraded" || status === "unknown" || score < 90);
  const palette = danger ? {
    border: "border-rose-400/40 hover:border-rose-400/70",
    icon: "border-rose-400/25 bg-rose-500/15 text-rose-200",
    ink: "text-rose-300", glow: "bg-rose-500/20", line: "#fb7185",
  } : caution ? {
    border: "border-amber-400/30 hover:border-amber-400/60",
    icon: "border-amber-400/25 bg-amber-500/15 text-amber-200",
    ink: "text-amber-300", glow: "bg-amber-500/15", line: "#fbbf24",
  } : {
    border: "border-emerald-400/30 hover:border-emerald-400/60",
    icon: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    ink: "text-emerald-300", glow: "bg-emerald-500/15", line: "#34d399",
  };
  const dnsText = dns === "paused" ? "Pausado"
    : dns === "disabled" ? "Desativado"
    : dns === "stale" ? "Sem checagem recente"
    : dns === "offline" ? "OFFLINE · acesso pelo domínio"
    : dns === "unstable" ? "Instável"
    : dns === "online" ? "Resolvido (IPTV não confirmado)" : "Aguardando";
  const latency = server.last_latency_ms != null && Number.isFinite(Number(server.last_latency_ms))
    ? Number(server.last_latency_ms) : null;
  return (
    <Link to="/app/servers/$id" params={{ id: server.id }} className="group block h-full rounded-[26px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400">
      <Card className={["relative isolate flex h-full min-h-[200px] flex-col overflow-hidden rounded-[26px] border bg-[#081425] p-4 text-white shadow-[0_18px_50px_-28px_rgba(3,12,28,0.9)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_55px_-24px_rgba(22,101,255,0.3)] motion-reduce:transform-none motion-reduce:transition-none sm:p-5",palette.border].join(" ")}>
        <div className={["pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full blur-[60px]",palette.glow].join(" ")} aria-hidden="true"/>
        <div className="relative flex min-w-0 items-start gap-3">
          <div className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-inner shadow-white/[0.05]",palette.icon].join(" ")}>
            <ServerIcon className="h-5 w-5" aria-hidden="true"/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-extrabold tracking-tight sm:text-lg">{server.name}</h3>
              <StatusDot status={status}/>
            </div>
            <p className={["mt-0.5 text-xs font-semibold",palette.ink].join(" ")} role={delayed ? "status" : undefined}>
              {delayed ? "HTTP atrasado · disponibilidade não confirmada"
                : "Saúde " + score + "% · " +
                  (status === "down" ? "Indisponível" : status === "unknown" ? "Em análise"
                    : status === "degraded" ? "Atenção" : healthLabel(score))}
            </p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition-colors group-hover:border-blue-400/40 group-hover:text-blue-300">
            <ChevronRight className="h-4 w-4" aria-hidden="true"/>
          </div>
        </div>
        {dns === "offline" && <p className="relative mt-2 text-[11px] font-semibold text-rose-300" role="status">{accessStatusLabel(server)}</p>}
        <div className="relative mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px]">
          <span className={["inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-semibold",
              dns === "offline" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" :
              ["stale","unstable","unknown"].includes(dns) ? "border-amber-400/25 bg-amber-400/10 text-amber-200" :
              "border-sky-400/25 bg-sky-400/10 text-sky-300"].join(" ")}>
            <Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
            <span className="leading-snug">DNS: {dnsText}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true"/>
            {server.last_dns_check_at ? "Há " + timeAgo(server.last_dns_check_at) : "DNS sem checagem"}
          </span>
        </div>
        <div className="relative mt-auto flex items-end justify-between gap-3 pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.045] px-2.5 py-2 text-xs text-slate-300">
            <Gauge className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true"/>
            Latência:
            <strong className={["font-mono tabular-nums",latency != null && latency >= 3000 ? "text-amber-300" : "text-white"].join(" ")}>
              {latency === null ? "—" : latency + " ms"}
            </strong>
          </span>
          <LatencyTrend checks={displayedChecks} color={palette.line} source={sparkSource === "DNS" ? "DNS" : "HTTP"}/>
        </div>
        {server.ssl_days_remaining != null &&
          <div className="relative mt-2 text-right"><Badge variant="outline" className="border-white/15 text-[10px] text-slate-300">SSL {server.ssl_days_remaining}d</Badge></div>}
        <div className="relative mt-3 border-t border-white/[0.07] pt-3">
          <UptimeSparkline checks={displayedChecks} source={sparkSource === "DNS" ? "DNS" : "HTTP"}/>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
            <span>{sparkSource === "DNS" ? "Histórico DNS real · não confirma IPTV"
              : sparkSource === "HTTP" ? "Histórico HTTP real"
              : sparkSource === "HTTP antigo" ? "Histórico HTTP antigo"
              : "Aguardando medições DNS/HTTP"}</span>
            <span>Últimas {Math.min(displayedChecks.length,40)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
