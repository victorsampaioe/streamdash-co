import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { UptimeSparkline } from "@/components/uptime-sparkline";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ArrowLeft, Download, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { runCheckNow } from "@/lib/monitoring.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/app/servers/$id")({
  component: ServerDetail,
});

function ServerDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runNow = useServerFn(runCheckNow);

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
    mutationFn: async () => { const { error } = await supabase.from("servers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removido"); navigate({ to: "/app/servers" }); },
  });

  async function handleRun() {
    try {
      await runNow({ data: { serverId: id } });
      toast.success("Verificação executada");
      refetch(); refetchChecks();
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
  }

  function exportCsv() {
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
        <div>
          <div className="flex items-center gap-3 mb-1">
            <StatusDot status={server.current_status} />
            <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
            <StatusLabel status={server.current_status} />
          </div>
          <p className="text-sm font-mono text-muted-foreground">http://{server.host}:80</p>
          {server.description && <p className="text-sm text-muted-foreground mt-1">{server.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRun}><Play className="h-4 w-4 mr-1" />Verificar agora</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="ghost" size="icon" onClick={() => confirm("Remover?") && del.mutate()}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Latência atual" value={server.last_latency_ms != null ? `${server.last_latency_ms}ms` : "—"} />
        <Metric label="Uptime 24h" value={uptime24h ? `${uptime24h}%` : "—"} />
        <Metric label="SSL restante" value={server.ssl_days_remaining != null ? `${server.ssl_days_remaining}d` : "—"} />
        <Metric label="Falhas seguidas" value={String(server.consecutive_failures)} />
      </div>

      <Card className="p-5">
        <div className="mb-3">
          <h3 className="font-medium text-sm">Últimos 40 checks</h3>
        </div>
        <UptimeSparkline checks={[...checks].slice(0, 40).reverse()} />
      </Card>

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
