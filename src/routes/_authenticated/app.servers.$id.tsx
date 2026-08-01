import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSubscription } from "@/hooks/use-subscription";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { UptimeSparkline } from "@/components/uptime-sparkline";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ArrowLeft, Download, Play, Trash2, RefreshCw, ShieldCheck, Cloud, Globe, Server as ServerIcon, Zap, Loader2, Palette } from "lucide-react";
import { toast } from "sonner";
import { runCheckNow } from "@/lib/monitoring.functions";
import { analyzeServer } from "@/lib/analysis.functions";
import { useServerFn } from "@tanstack/react-start";
import { GlobalCheckMap } from "@/components/global-check-map";
import { MonitorBadge } from "@/components/monitor-badge";
import { IptvPanel } from "@/components/iptv/iptv-panel";
import { KumaPanel } from "@/components/kuma/kuma-panel";
import { DnsPanel } from "@/components/dns/dns-panel";


export const Route = createFileRoute("/_authenticated/app/servers/$id")({
  component: ServerDetail,
});

function ServerDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const runNow = useServerFn(runCheckNow);
  const runAnalyze = useServerFn(analyzeServer);
  const { data: subInfo } = useSubscription();

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const { data: server, refetch } = useQuery({
    queryKey: ["server", id],
    queryFn: async () => (await supabase.from("servers").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: checks = [], refetch: refetchChecks } = useQuery({
    queryKey: ["checks", id],
    queryFn: async () =>
      (await supabase.from("checks").select("*").eq("server_id", id).order("checked_at", { ascending: false }).limit(200)).data ?? [],
    refetchInterval: 15000,
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["incidents", id],
    queryFn: async () =>
      (await supabase.from("incidents").select("*").eq("server_id", id).order("started_at", { ascending: false }).limit(30)).data ?? [],
  });

  const { data: analysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ["analysis", id],
    queryFn: async () => (await supabase.from("server_analysis").select("*").eq("server_id", id).maybeSingle()).data,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`srv-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "servers", filter: `id=eq.${id}` }, () => refetch())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checks", filter: `server_id=eq.${id}` }, () => refetchChecks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refetch, refetchChecks]);

  const chartData = useMemo(
    () => [...checks].reverse().map((c) => ({ t: new Date(c.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), latency: c.latency_ms ?? 0 })),
    [checks]
  );

  const uptime24h = useMemo(() => {
    if (checks.length === 0) return null;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = checks.filter((c) => new Date(c.checked_at).getTime() >= cutoff);
    if (!recent.length) return null;
    const ups = recent.filter((c) => c.status === "up").length;
    return ((ups / recent.length) * 100).toFixed(2);
  }, [checks]);

  const togglePublic = useMutation({
    mutationFn: async (val: boolean) => {
      const slug = val ? (server?.public_slug ?? `${(server?.name ?? "srv").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`) : null;
      const { error } = await supabase.from("servers").update({ is_public: val, public_slug: slug }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["server", id] }); toast.success("Atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateConfig = useMutation({
    mutationFn: async (patch: { interval_seconds?: number; failure_threshold?: number }) => {
      const { error } = await supabase.from("servers").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["server", id] }); toast.success("Configuração salva"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_server", { _id: id });
      if (error) throw error;
      if (data === false) throw new Error("Servidor não encontrado ou já removido");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servers"] }); toast.success("Removido"); navigate({ to: "/app/servers" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyze = useMutation({
    mutationFn: () => runAnalyze({ data: { serverId: id } }),
    onSuccess: () => { toast.success("Análise atualizada"); refetchAnalysis(); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleRun() {
    try {
      await runNow({ data: { serverId: id } });
      toast.success("Verificação executada");
      refetch(); refetchChecks();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  function exportCsv() {
    if (!subInfo?.isActive) {
      toast.error("Assinatura inativa. Renove seu plano via PIX para exportar relatórios.");
      return;
    }
    const header = "checked_at,status,http_status,latency_ms,ssl_days_remaining,error\n";
    const rows = checks.map((c) => `${c.checked_at},${c.status},${c.http_status ?? ""},${c.latency_ms ?? ""},${c.ssl_days_remaining ?? ""},"${(c.error ?? "").replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${server?.name ?? "server"}-checks.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!server) return <div className="p-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/app/servers" className="hover:text-foreground"><ArrowLeft className="h-4 w-4 inline mr-1" />Servidores</Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            <StatusDot status={server.current_status} />
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight break-words min-w-0">{server.name}</h1>
            <StatusLabel status={server.current_status} />
          </div>
          {server.description && <p className="text-sm text-muted-foreground mt-1 break-words">{server.description}</p>}
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={handleRun}><Play className="h-4 w-4 mr-1" />Verificar</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />CSV</Button>
          {isAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/artes" search={{ server: id }}><Palette className="h-4 w-4 mr-1" />Gerar Arte de Novidades</Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="dns">DNS</TabsTrigger>
          <TabsTrigger value="kuma">Monitoramento</TabsTrigger>
          <TabsTrigger value="iptv">IPTV</TabsTrigger>
          <TabsTrigger value="analysis">Análise</TabsTrigger>
          <TabsTrigger value="badge">Selo</TabsTrigger>
        </TabsList>

        <TabsContent value="dns" className="mt-6">
          <DnsPanel serverId={id} />
        </TabsContent>

        <TabsContent value="kuma" className="mt-6">
          <KumaPanel serverId={id} />
        </TabsContent>

        <TabsContent value="iptv" className="mt-6">
          <IptvPanel serverId={id} server={server} />
        </TabsContent>



        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Latência atual" value={server.last_latency_ms != null ? `${server.last_latency_ms}ms` : "—"} />
            <Metric label="Uptime 24h" value={uptime24h ? `${uptime24h}%` : "—"} />
            <Metric label="SSL restante" value={server.ssl_days_remaining != null ? `${server.ssl_days_remaining}d` : "—"} />
            <Metric label="Falhas seguidas" value={String(server.consecutive_failures)} />
          </div>

          <Card className="p-5">
            <div className="mb-3"><h3 className="font-medium text-sm">Últimos 40 checks</h3></div>
            <UptimeSparkline checks={[...checks].slice(0, 40).reverse()} />
          </Card>

          <GlobalCheckMap serverId={id} />

          <Card className="p-5">
            <h3 className="font-medium text-sm mb-4">Latência (últimas 200 verificações)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" unit="ms" />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="latency" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-medium text-sm mb-4">Incidentes</h3>
              {incidents.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum incidente registrado.</p> : (
                <ul className="space-y-2">
                  {incidents.map((i) => (
                    <li key={i.id} className="text-sm flex items-center justify-between">
                      <div>
                        <div className="font-mono text-xs">{new Date(i.started_at).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{i.reason ?? "—"}</div>
                      </div>
                      {i.ended_at ? <Badge variant="outline" className="text-success">Resolvido</Badge> : <Badge variant="destructive">Em curso</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5 space-y-4">
              <h3 className="font-medium text-sm">Configuração</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo (s)</Label>
                  <Input type="number" min={15} max={3600} defaultValue={server.interval_seconds}
                    onBlur={(e) => { const v = Number(e.target.value); if (v !== server.interval_seconds) updateConfig.mutate({ interval_seconds: v }); }} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Falhas p/ alerta</Label>
                  <Input type="number" min={1} max={20} defaultValue={server.failure_threshold}
                    onBlur={(e) => { const v = Number(e.target.value); if (v !== server.failure_threshold) updateConfig.mutate({ failure_threshold: v }); }} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <div>
                  <div className="text-sm font-medium">Página pública</div>
                  {server.is_public && server.public_slug && (
                    <Link to="/status/$slug" params={{ slug: server.public_slug }} className="text-xs text-primary hover:underline font-mono">
                      /status/{server.public_slug}
                    </Link>
                  )}
                </div>
                <Switch checked={server.is_public} onCheckedChange={(v) => togglePublic.mutate(v)} />
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-medium">Análise técnica</h3>
              <p className="text-xs text-muted-foreground">
                {analysis?.analyzed_at ? `Última análise: ${new Date(analysis.analyzed_at).toLocaleString()}` : "Ainda não analisado"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => analyze.mutate()} disabled={analyze.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${analyze.isPending ? "animate-spin" : ""}`} />
              {analyze.isPending ? "Analisando..." : "Reanalisar"}
            </Button>
          </div>

          {!analysis && (
            <Card className="p-8 text-center text-sm text-muted-foreground border-dashed">
              Clique em <strong>Reanalisar</strong> para coletar SSL, IPs, CDN, geolocalização e histórico de certificados.
            </Card>
          )}

          {analysis && (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <InfoCard icon={<Cloud className="h-4 w-4" />} label="CDN" value={analysis.cdn_provider ?? (analysis.is_cloudflare ? "Cloudflare" : "Direto")} />
                <InfoCard icon={<ShieldCheck className="h-4 w-4" />} label="Emissor SSL" value={analysis.ssl_issuer ?? "—"} />
                <InfoCard icon={<Globe className="h-4 w-4" />} label="Localização" value={[analysis.city, analysis.country].filter(Boolean).join(", ") || "—"} />
                <InfoCard icon={<Zap className="h-4 w-4" />} label="Resposta HEAD" value={analysis.response_ms != null ? `${analysis.response_ms}ms` : "—"} />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-5 space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2"><ServerIcon className="h-4 w-4" /> Endereços IP</h4>
                  <Row label="IPv4" value={analysis.ipv4?.join(", ") || "—"} mono />
                  <Row label="IPv6" value={analysis.ipv6?.join(", ") || "—"} mono />
                  <Row label="TTL" value={analysis.ttl_seconds != null ? `${analysis.ttl_seconds}s` : "—"} />
                  <Row label="ASN" value={analysis.asn ?? "—"} />
                  <Row label="Organização" value={analysis.org ?? "—"} />
                </Card>

                <Card className="p-5 space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2"><Globe className="h-4 w-4" /> Nameservers</h4>
                  {analysis.nameservers && analysis.nameservers.length > 0 ? (
                    <ul className="space-y-1 text-xs font-mono text-muted-foreground">
                      {analysis.nameservers.map((n: string) => <li key={n}>{n}</li>)}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">—</p>}
                  <div className="pt-3 border-t border-border/60 space-y-1">
                    <div className="text-xs font-medium text-foreground">Validade do certificado</div>
                    <div className="text-xs text-muted-foreground">
                      {analysis.ssl_expires_at ? new Date(analysis.ssl_expires_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </Card>
              </div>

              {Array.isArray(analysis.cert_history) && analysis.cert_history.length > 0 && (
                <Card className="p-5">
                  <h4 className="text-sm font-medium mb-3">Histórico de certificados <span className="text-xs text-muted-foreground">(via crt.sh)</span></h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr className="text-left">
                          <th className="py-2 pr-4 font-medium">Emissor</th>
                          <th className="py-2 pr-4 font-medium">Emitido</th>
                          <th className="py-2 font-medium">Expira</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analysis.cert_history as Array<{ issuer: string; not_before: string; not_after: string }>).map((c, i) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="py-2 pr-4 max-w-xs truncate">{c.issuer}</td>
                            <td className="py-2 pr-4 font-mono">{new Date(c.not_before).toLocaleDateString()}</td>
                            <td className="py-2 font-mono">{new Date(c.not_after).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="badge" className="mt-6">
          {server.is_public && server.public_slug ? (
            <MonitorBadge serverName={server.name} slug={server.public_slug} />
          ) : (
            <Card className="p-8 text-center space-y-3 border-dashed max-w-md mx-auto">
              <p className="text-sm text-muted-foreground">
                Para gerar o selo com QR Code, ative a página pública deste servidor na aba <strong>Visão geral</strong>.
              </p>
              <Button variant="outline" size="sm" onClick={() => togglePublic.mutate(true)}>Ativar página pública</Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDel} onOpenChange={(o) => { if (!o && !del.isPending) setConfirmDel(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover servidor</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga permanentemente "{server.name}" e todo o histórico de monitoramento. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={del.isPending} onClick={(e) => { e.preventDefault(); del.mutate(); }}>
              {del.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {del.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </Card>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold truncate" title={value}>{value}</div>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
