import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Globe,
  Loader2,
  Network,
  Plug,
  RefreshCw,
  ShieldCheck,
  Signal,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getKumaStatus,
  provisionKumaMonitors,
  setKumaEnabled,
  syncKumaNow,
} from "@/lib/kuma.functions";

const KIND_LABEL: Record<string, string> = {
  http: "HTTP/HTTPS",
  ping: "Ping",
  dns: "DNS Record",
  tcp: "Porta TCP",
  api: "Player API",
  ssl: "Certificado SSL",
};

const KIND_ICON: Record<string, any> = {
  http: Globe,
  ping: Signal,
  dns: Network,
  tcp: Plug,
  api: Activity,
  ssl: ShieldCheck,
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  up: { label: "Online", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500", dot: "bg-emerald-500" },
  down: { label: "Offline", cls: "border-red-500/30 bg-red-500/10 text-red-500", dot: "bg-red-500" },
  pending: { label: "Pendente", cls: "border-amber-500/30 bg-amber-500/10 text-amber-500", dot: "bg-amber-500" },
  maintenance: { label: "Manutenção", cls: "border-sky-500/30 bg-sky-500/10 text-sky-500", dot: "bg-sky-500" },
};

function fmtPct(v: number | null | undefined) {
  return v == null ? "—" : `${Number(v).toFixed(2)}%`;
}
function fmtMs(v: number | null | undefined) {
  return v == null ? "—" : `${Math.round(Number(v))} ms`;
}
function fmtDate(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}
function fmtDuration(s: number | null | undefined) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  return `${(s / 3600).toFixed(1)}h`;
}

export function KumaPanel({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [hours, setHours] = useState(24);
  const [tcpPort, setTcpPort] = useState<string>("");

  const fetchStatus = useServerFn(getKumaStatus);
  const provision = useServerFn(provisionKumaMonitors);
  const sync = useServerFn(syncKumaNow);
  const toggle = useServerFn(setKumaEnabled);

  const { data, isLoading } = useQuery({
    queryKey: ["kuma", serverId, hours],
    queryFn: () => fetchStatus({ data: { serverId, hours } }),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["kuma", serverId] });

  const provisionM = useMutation({
    mutationFn: (port?: number) => provision({ data: { serverId, tcpPort: port } }),
    onSuccess: (r: any) => {
      toast.success(`${r.created} monitor(es) criados no Uptime Kuma`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar monitores"),
  });

  const syncM = useMutation({
    mutationFn: () => sync({}),
    onSuccess: () => {
      toast.success("Dados sincronizados");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar"),
  });

  const toggleM = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { serverId, enabled } }),
    onSuccess: invalidate,
  });

  const statuses = (data?.statuses ?? []) as any[];
  const byKind = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of statuses) m[s.kind] = s;
    return m;
  }, [statuses]);

  const chartData = useMemo(() => {
    return (data?.beats ?? [])
      .filter((b: any) => b.kind === "http")
      .map((b: any) => ({
        t: new Date(b.checked_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        ms: b.latency_ms ?? 0,
      }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando dados do motor de monitoramento…
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Motor Uptime Kuma não conectado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A integração está pronta no backend, mas ainda falta apontar a instância privada do Uptime Kuma
            (ex.: <code className="text-foreground">kuma.streammonitor.site</code>) e salvar as credenciais de
            acesso com segurança.
          </p>
          <p>
            Assim que a instância estiver no ar, os monitores de HTTP, Ping, DNS, Porta TCP, Player API e SSL
            passam a ser criados automaticamente para cada servidor cadastrado.
          </p>
        </CardContent>
      </Card>
    );
  }

  const srv: any = data.server;
  const linked = Boolean(srv?.kuma_http_id);
  const main = byKind.http;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Switch checked={!!srv?.kuma_enabled} onCheckedChange={(v) => toggleM.mutate(v)} />
          <div>
            <p className="text-sm font-medium">Motor Uptime Kuma</p>
            <p className="text-xs text-muted-foreground">
              Última sincronização: {fmtDate(srv?.kuma_synced_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!linked && (
            <div className="flex items-center gap-2">
              <Label htmlFor="tcpPort" className="text-xs whitespace-nowrap">
                Porta TCP
              </Label>
              <Input
                id="tcpPort"
                className="h-9 w-24"
                placeholder={String(srv?.kuma_tcp_port ?? 80)}
                value={tcpPort}
                onChange={(e) => setTcpPort(e.target.value)}
              />
            </div>
          )}
          <Button
            variant={linked ? "outline" : "default"}
            size="sm"
            disabled={provisionM.isPending}
            onClick={() => provisionM.mutate(tcpPort ? Number(tcpPort) : undefined)}
          >
            {provisionM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plug className="mr-2 h-4 w-4" />
            )}
            {linked ? "Recriar faltantes" : "Criar monitores"}
          </Button>
          <Button variant="outline" size="sm" disabled={syncM.isPending} onClick={() => syncM.mutate()}>
            {syncM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar
          </Button>
        </div>
      </div>

      {srv?.kuma_error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          {srv.kuma_error}
        </div>
      )}

      {/* Uptime resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Uptime 24h", value: main?.uptime_24h },
          { label: "Uptime 7 dias", value: data.uptime7d?.http },
          { label: "Uptime 30 dias", value: main?.uptime_30d },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtPct(c.value)}</p>
              <Progress value={Number(c.value ?? 0)} className="mt-3 h-1.5" />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Latência atual / média</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtMs(main?.latency_ms)}</p>
            <p className="mt-3 text-xs text-muted-foreground">Média: {fmtMs(main?.avg_latency_ms)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monitores */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.keys(KIND_LABEL).map((kind) => {
          const s = byKind[kind];
          const meta = STATUS_META[s?.status ?? "pending"];
          const Icon = KIND_ICON[kind];
          return (
            <Card key={kind} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {KIND_LABEL[kind]}
                </CardTitle>
                <Badge variant="outline" className={meta.cls}>
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {s ? meta.label : "Não criado"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Latência</span>
                  <span className="font-medium text-foreground tabular-nums">{fmtMs(s?.latency_ms)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Uptime 24h</span>
                  <span className="font-medium text-foreground tabular-nums">{fmtPct(s?.uptime_24h)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Última verificação</span>
                  <span className="font-medium text-foreground">{fmtDate(s?.last_check_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Última queda</span>
                  <span className="font-medium text-foreground">{fmtDuration(s?.last_down_duration_s)}</span>
                </div>
                {kind === "dns" && (
                  <div className="flex justify-between">
                    <span>IP atual</span>
                    <span className="font-medium text-foreground">{s?.resolved_ip ?? s?.message ?? "—"}</span>
                  </div>
                )}
                {kind === "ssl" && (
                  <div className="flex justify-between">
                    <span>SSL expira em</span>
                    <span className="font-medium text-foreground">
                      {s?.cert_days_remaining != null ? `${s.cert_days_remaining} dias` : "—"}
                    </span>
                  </div>
                )}
                {kind === "api" && (
                  <div className="flex justify-between">
                    <span>Resposta da API</span>
                    <span className="font-medium text-foreground">{fmtMs(s?.latency_ms)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-4 w-4 text-muted-foreground" /> Tempo de resposta
          </CardTitle>
          <Tabs value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <TabsList className="h-8">
              <TabsTrigger value="24" className="text-xs">
                24h
              </TabsTrigger>
              <TabsTrigger value="168" className="text-xs">
                7d
              </TabsTrigger>
              <TabsTrigger value="720" className="text-xs">
                30d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="h-64">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="kumaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} minTickGap={30} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <RTooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ms"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#kumaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem dados de resposta ainda.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incidentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de incidentes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.incidents?.length ? (
            <div className="space-y-2">
              {data.incidents.map((i: any) => (
                <div
                  key={i.id}
                  className="flex flex-col gap-1 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {KIND_LABEL[i.kind] ?? i.kind} · {i.ended_at ? "Resolvido" : "Em andamento"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{i.reason ?? "Indisponível"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground sm:text-right">
                    <p>{fmtDate(i.started_at)}</p>
                    <p>Duração: {fmtDuration(i.duration_s)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum incidente registrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
