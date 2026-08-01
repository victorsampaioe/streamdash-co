import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { Activity, RefreshCw, Radar, Film, Tv, Layers, Clock, MapPin, ShieldAlert, Rocket, Library, Zap, Timer, BarChart3, BellRing, Lock } from "lucide-react";
import { detectIptvNow, runIptvSyncNow, acknowledgeIptvAlert } from "@/lib/iptv.functions";

type Range = "24h" | "7d" | "30d";
const RANGE_MS: Record<Range, number> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };

function healthLabel(score: number) {
  if (score >= 95) return { label: "Excelente", cls: "text-success" };
  if (score >= 85) return { label: "Muito Bom", cls: "text-success" };
  if (score >= 70) return { label: "Bom", cls: "text-success" };
  if (score >= 50) return { label: "Atenção", cls: "text-warning" };
  return { label: "Crítico", cls: "text-destructive" };
}

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

export function IptvPanel({ serverId, server }: { serverId: string; server: any }) {
  const qc = useQueryClient();
  const detect = useServerFn(detectIptvNow);
  const sync = useServerFn(runIptvSyncNow);
  const ack = useServerFn(acknowledgeIptvAlert);
  const [range, setRange] = useState<Range>("7d");
  const [creds, setCreds] = useState({ u: server?.iptv_username ?? "", p: server?.iptv_password ?? "" });

  const since = new Date(Date.now() - RANGE_MS[range]).toISOString();

  const { data: syncs = [], refetch: refetchSyncs } = useQuery({
    queryKey: ["iptv-syncs", serverId, range],
    queryFn: async () =>
      (await supabase.from("iptv_syncs").select("*").eq("server_id", serverId).gte("synced_at", since)
        .order("synced_at", { ascending: false }).limit(500)).data ?? [],
  });

  const last = syncs[0];
  const prev = syncs[1];

  const { data: streams = [] } = useQuery({
    queryKey: ["iptv-streams", serverId, last?.id],
    enabled: !!last?.id,
    queryFn: async () =>
      (await supabase.from("iptv_stream_tests").select("*").eq("sync_id", last!.id).order("kind")).data ?? [],
  });

  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ["iptv-alerts", serverId],
    queryFn: async () =>
      (await supabase.from("iptv_alerts").select("*").eq("server_id", serverId)
        .order("created_at", { ascending: false }).limit(30)).data ?? [],
    refetchInterval: 60_000,
  });

  const { data: ipHistory = [] } = useQuery({
    queryKey: ["iptv-ips", serverId],
    queryFn: async () =>
      (await supabase.from("iptv_ip_history").select("*").eq("server_id", serverId)
        .order("changed_at", { ascending: false }).limit(20)).data ?? [],
  });

  const { data: regions = [] } = useQuery({
    queryKey: ["iptv-regions", serverId],
    queryFn: async () =>
      (await supabase.rpc("get_region_stats", { _server_id: serverId, _minutes: 60 })).data ?? [],
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`iptv-${serverId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "iptv_syncs", filter: `server_id=eq.${serverId}` }, () => refetchSyncs())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "iptv_alerts", filter: `server_id=eq.${serverId}` }, () => refetchAlerts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverId, refetchSyncs, refetchAlerts]);

  const chart = useMemo(
    () => [...syncs].reverse().map((s) => ({
      t: new Date(s.synced_at).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      canais: s.channels ?? 0,
      health: s.health_score ?? 0,
      api: s.api_ms ?? 0,
    })),
    [syncs],
  );

  const saveConfig = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("servers").update(patch as never).eq("id", serverId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["server", serverId] }); toast.success("Configuração salva"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doDetect = useMutation({
    mutationFn: () => detect({ data: { serverId } }),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["server", serverId] }); toast.success(`Detectado: ${r.kind}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doSync = useMutation({
    mutationFn: (mode: "smart" | "full") => sync({ data: { serverId, mode } }),
    onSuccess: () => { refetchSyncs(); refetchAlerts(); qc.invalidateQueries({ queryKey: ["server", serverId] }); toast.success("Sincronização concluída"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const score = server?.health_score ?? last?.health_score ?? null;
  const hl = healthLabel(score ?? 0);

  return (
    <div className="space-y-6">
      {/* Health score */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">IPTV Health Score</div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold font-mono">{score != null ? `${score}%` : "—"}</span>
              {score != null && <span className={`text-sm font-medium ${hl.cls}`}>{hl.label}</span>}
            </div>
            <div className="mt-3 h-2.5 w-56 max-w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${score == null ? "bg-muted" : score >= 70 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-destructive"}`}
                style={{ width: `${score ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Uptime 30% · Latência 20% · Player API 15% · Streams 20% · Estabilidade 10% · IP/DNS 5%
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => doDetect.mutate()} disabled={doDetect.isPending}>
              <Radar className={`h-4 w-4 mr-1 ${doDetect.isPending ? "animate-spin" : ""}`} />Detectar
            </Button>
            <Button size="sm" variant="outline" onClick={() => doSync.mutate("smart")} disabled={doSync.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${doSync.isPending ? "animate-spin" : ""}`} />Sincronizar
            </Button>
            <Button size="sm" onClick={() => doSync.mutate("full")} disabled={doSync.isPending}>
              <Activity className="h-4 w-4 mr-1" />Análise completa
            </Button>
          </div>
        </div>
      </Card>

      {/* Conteúdo + variações */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Delta icon={<Tv className="h-4 w-4" />} label="Canais" curr={last?.channels} prev={prev?.channels} />
        <Delta icon={<Film className="h-4 w-4" />} label="Filmes" curr={last?.movies} prev={prev?.movies} />
        <Delta icon={<Layers className="h-4 w-4" />} label="Séries" curr={last?.series} prev={prev?.series} />
        <Delta icon={<Layers className="h-4 w-4" />} label="Categorias" curr={last?.categories} prev={prev?.categories} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Mini label="Player API" value={last?.api_ms != null ? `${last.api_ms}ms` : "—"} tone={last?.api_ms && last.api_ms > 5000 ? "bad" : "ok"} />
        <Mini
          label="Login Xtream"
          value={!last ? "—" : !last.login_checked ? "Não verificado" : last.login_ok ? "Válido" : "Inválido"}
          tone={!last || !last.login_checked ? "muted" : last.login_ok ? "ok" : "bad"}
        />
        <Mini label="JSON válido" value={last ? (last.json_valid ? "Sim" : "Não") : "—"} tone={last?.json_valid ? "ok" : last ? "bad" : "muted"} />
        <Mini label="Última sync" value={last ? new Date(last.synced_at).toLocaleString() : "—"} />
      </div>

      {/* Diagnóstico da Player API */}
      {last?.diagnostics && <ApiDiagnostics diag={last.diagnostics as any} error={last.error} />}


      {/* Streams */}
      <Card className="p-5">
        <h3 className="font-medium text-sm mb-4">Teste real de streams (amostragem)</h3>
        {streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma amostra ainda. Ative os testes de stream na configuração e rode uma sincronização.
          </p>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {streams.map((s: any) => (
              <div key={s.id} className="rounded-lg border border-border/60 p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {s.kind === "live" ? "Live" : s.kind === "vod" ? "Filmes" : "Séries"}
                  </span>
                  <span className={s.ok ? "text-success" : "text-destructive"}>{s.ok ? "🟢" : "🔴"}</span>
                </div>
                <div className="text-2xl font-mono font-bold">{s.start_ms != null ? `${(s.start_ms / 1000).toFixed(1)}s` : "—"}</div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>{s.resolution ?? "—"} · {s.codec ?? "—"}</div>
                  <div>{s.bitrate_kbps ? `${(s.bitrate_kbps / 1000).toFixed(1)} Mbps` : "— Mbps"}</div>
                  <div>Buffer: {s.buffer_ms != null ? `${(s.buffer_ms / 1000).toFixed(1)}s` : "—"}</div>
                  {s.label && <div className="truncate">{s.label}</div>}
                  {s.error && <div className="text-destructive truncate">{s.error}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Regiões */}
      <Card className="p-5">
        <h3 className="font-medium text-sm mb-4 flex items-center gap-2"><MapPin className="h-4 w-4" />Comparação entre regiões (60min)</h3>
        {regions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem reports regionais recentes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground text-left">
                <tr><th className="py-2 pr-4">Região</th><th className="py-2 pr-4">Média</th><th className="py-2 pr-4">p95</th><th className="py-2 pr-4">Min/Max</th><th className="py-2">Falhas</th></tr>
              </thead>
              <tbody>
                {[...regions].sort((a: any, b: any) => Number(a.avg_ms) - Number(b.avg_ms)).map((r: any) => (
                  <tr key={r.region_code} className="border-t border-border/40">
                    <td className="py-2 pr-4 font-medium">{r.region_code}</td>
                    <td className="py-2 pr-4 font-mono">{r.avg_ms ?? "—"}ms</td>
                    <td className="py-2 pr-4 font-mono">{r.p95_ms ?? "—"}ms</td>
                    <td className="py-2 pr-4 font-mono">{r.min_ms ?? "—"}/{r.max_ms ?? "—"}</td>
                    <td className="py-2 font-mono">{r.downs}/{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {last && (
              <p className="text-xs text-muted-foreground mt-3">
                Melhor: <strong>{last.fastest_region ?? "—"}</strong> · Pior: <strong>{last.slowest_region ?? "—"}</strong> · Média global: <strong>{last.avg_region_ms ?? "—"}ms</strong>
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Histórico */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-medium text-sm">Histórico inteligente</h3>
          <div className="flex gap-1">
            {(["24h", "7d", "30d"] as Range[]).map((r) => (
              <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>{r}</Button>
            ))}
          </div>
        </div>
        {chart.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem sincronizações neste período.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="canais" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="health" stroke="var(--color-success)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* DNS intelligence + alertas */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h3 className="font-medium text-sm">DNS Intelligence</h3>
          <KV label="IP atual" value={last?.ip ?? "—"} />
          <KV label="ASN" value={last?.asn ?? "—"} />
          <KV label="Datacenter" value={last?.datacenter ?? "—"} />
          <KV label="Mudanças de IP" value={String(ipHistory.length)} />
          {ipHistory.length > 0 && (
            <ul className="pt-2 border-t border-border/60 space-y-1 text-xs text-muted-foreground">
              {ipHistory.slice(0, 6).map((h: any) => (
                <li key={h.id} className="font-mono truncate">
                  {new Date(h.changed_at).toLocaleString()} · {h.old_ip} → {h.new_ip}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Alertas inteligentes</h3>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta. Tudo estável.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {alerts.map((a: any) => (
                <li key={a.id} className="flex items-start justify-between gap-2 text-sm border-b border-border/40 pb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium break-words">{a.title}</span>
                      <Badge variant={a.severity === "critical" ? "destructive" : "outline"} className="text-[10px]">{a.severity}</Badge>
                    </div>
                    {a.detail && <div className="text-xs text-muted-foreground break-words">{a.detail}</div>}
                    <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />{new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!a.acknowledged_at && (
                    <Button size="sm" variant="ghost" className="shrink-0"
                      onClick={async () => { await ack({ data: { alertId: a.id } }); refetchAlerts(); }}>OK</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Configuração */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-medium text-sm">Configuração do monitoramento IPTV</h3>
          <Badge variant="outline">Detectado: {server?.iptv_detected ?? "none"}</Badge>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Modo</Label>
            <Select value={server?.iptv_mode ?? "basic"} onValueChange={(v) => saveConfig.mutate({ iptv_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">🟢 Básico (DNS/HTTP)</SelectItem>
                <SelectItem value="smart">🟡 Inteligente (Xtream)</SelectItem>
                <SelectItem value="full">🔴 Completo (M3U + streams)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Intervalo</Label>
            <Select value={String(server?.iptv_interval_minutes ?? 30)} onValueChange={(v) => saveConfig.mutate({ iptv_interval_minutes: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 15, 30, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} minutos</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Amostra de canais</Label>
            <Input type="number" min={5} max={10} defaultValue={server?.iptv_sample_size ?? 5}
              onBlur={(e) => {
                const v = Math.min(10, Math.max(5, Number(e.target.value)));
                if (v !== server?.iptv_sample_size) saveConfig.mutate({ iptv_sample_size: v });
              }} />
          </div>
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 text-primary p-2 shrink-0">
              <Rocket className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm">Ative o Modo Inteligente IPTV</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Configure a URL Xtream, usuário e senha para habilitar o monitoramento avançado do seu servidor.
                Após a configuração, o Stream Monitor realizará automaticamente:
              </p>
            </div>
          </div>

          <ul className="grid sm:grid-cols-2 gap-2">
            {[
              { icon: Tv, text: "Verificação de canais ao vivo" },
              { icon: Film, text: "Monitoramento de Filmes (VOD)" },
              { icon: Library, text: "Monitoramento de Séries" },
              { icon: Zap, text: "Testes da Player API" },
              { icon: Timer, text: "Tempo de resposta" },
              { icon: BarChart3, text: "Análise de desempenho" },
              { icon: BellRing, text: "Alertas automáticos de falhas" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-xs rounded-lg bg-background/60 border border-border/50 px-3 py-2">
                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{text}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-start gap-2 text-[11px] text-muted-foreground border-t border-primary/15 pt-3">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-px text-success" />
            <span>
              Suas credenciais são armazenadas de forma criptografada e utilizadas exclusivamente para realizar os
              monitoramentos automáticos.
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Usuário Xtream</Label>
            <Input value={creds.u} onChange={(e) => setCreds({ ...creds, u: e.target.value })} placeholder="usuario" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Senha Xtream</Label>
            <Input type="password" value={creds.p} onChange={(e) => setCreds({ ...creds, p: e.target.value })} placeholder="••••••" />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => saveConfig.mutate({ iptv_username: creds.u || null, iptv_password: creds.p || null })}>
          Salvar credenciais
        </Button>

        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div>
            <div className="text-sm font-medium">Testes reais de stream</div>
            <p className="text-xs text-muted-foreground">Amostragem leve de Live, VOD e Séries.</p>
          </div>
          <Switch checked={!!server?.iptv_stream_tests} onCheckedChange={(v) => saveConfig.mutate({ iptv_stream_tests: v })} />
        </div>
      </Card>
    </div>
  );
}

function Delta({ icon, label, curr, prev }: { icon: React.ReactNode; label: string; curr?: number | null; prev?: number | null }) {
  const diff = curr != null && prev != null ? curr - prev : null;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">{icon}{label}</div>
      <div className="text-2xl font-bold font-mono">{num(curr)}</div>
      {diff != null && diff !== 0 && (
        <div className={`text-xs font-medium ${diff < 0 ? "text-destructive" : "text-success"}`}>
          {diff < 0 ? "▼" : "▲"} {Math.abs(diff).toLocaleString("pt-BR")}
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value, tone = "muted" }: { label: string; value: string; tone?: "ok" | "bad" | "muted" }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-mono font-medium ${tone === "ok" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}

function ApiDiagnostics({
  diag,
  error,
}: {
  diag: {
    url?: string; final_url?: string | null; redirected?: boolean;
    http_status?: number | null; status_text?: string | null; elapsed_ms?: number | null;
    content_type?: string | null; size_bytes?: number | null; body_snippet?: string | null;
    stage?: string; message?: string;
  };
  error?: string | null;
}) {
  const ok = diag.stage === "ok";
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />Diagnóstico da Player API
        </h3>
        <Badge variant={ok ? "outline" : "destructive"} className="text-[10px] uppercase">
          {ok ? "resposta válida" : `falha: ${diag.stage ?? "desconhecida"}`}
        </Badge>
      </div>

      {!ok && (diag.message || error) && (
        <p className="text-xs text-destructive break-words">{diag.message || error}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <KV label="URL chamada" value={diag.url ?? "—"} />
        <KV label="Status HTTP" value={diag.http_status != null ? `${diag.http_status} ${diag.status_text ?? ""}`.trim() : "sem resposta"} />
        <KV label="Tempo de resposta" value={diag.elapsed_ms != null ? `${diag.elapsed_ms}ms` : "—"} />
        <KV label="Content-Type" value={diag.content_type ?? "—"} />
        <KV label="Tamanho" value={diag.size_bytes != null ? `${diag.size_bytes.toLocaleString("pt-BR")} bytes` : "—"} />
        <KV label="Redirect" value={diag.redirected ? `Sim → ${diag.final_url ?? "—"}` : "Não"} />
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1">Primeiro trecho da resposta</div>
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-muted/40 p-3">
          {diag.body_snippet?.trim() || "(resposta vazia)"}
        </pre>
      </div>
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-xs truncate max-w-[60%]">{value}</span>
    </div>
  );
}
