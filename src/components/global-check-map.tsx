import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { WORLD_MASK, WORLD_COLS, WORLD_ROWS_TOTAL, WORLD_ROW_OFFSET } from "./world-mask";

type Region = {
  code: string;
  name: string;
  city: string;
  country: string;
  flag: string;
  latitude: number;
  longitude: number;
  enabled: boolean;
};

type RegionCheck = {
  region_code: string;
  status: string;
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  checked_at: string;
  details?: Record<string, any> | null;
  source?: string | null;
};

type MatrixRow = {
  region_code: string;
  region_name: string;
  city: string;
  country: string;
  flag: string;
  status: string;
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  details: Record<string, any> | null;
  source: string | null;
  checked_at: string | null;
};

type StatRow = {
  region_code: string;
  total: number;
  ups: number;
  downs: number;
  min_ms: number | null;
  max_ms: number | null;
  avg_ms: number | null;
  p95_ms: number | null;
};

type Verdict = {
  verdict: "up" | "investigating" | "possible_down" | "down" | "nodata";
  total: number;
  up: number;
  down: number;
  degraded: number;
  avg_latency_ms: number;
  regions: {
    code: string; name: string; city: string; flag: string; status: string;
    latency_ms: number | null; http_status: number | null; error: string | null;
    details: Record<string, any>; source: string | null; checked_at: string | null;
  }[];
};

const STATUS_HEX: Record<string, string> = {
  up: "hsl(142 72% 45%)",
  degraded: "hsl(38 92% 55%)",
  down: "hsl(0 84% 60%)",
  testing: "hsl(199 89% 55%)",
  unknown: "hsl(215 16% 55%)",
  nodata: "hsl(215 16% 40%)",
};

const dotBg: Record<string, string> = {
  up: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
  testing: "bg-primary",
  unknown: "bg-muted-foreground",
  nodata: "bg-muted-foreground/40",
};

function humanAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

function statusLabel(s: string): string {
  switch (s) {
    case "up": return "Online";
    case "degraded": return "Degradado";
    case "down": return "Offline";
    case "testing": return "Testando";
    case "nodata": return "Sem dados";
    default: return "Desconhecido";
  }
}

const VERDICT_UI: Record<Verdict["verdict"], { emoji: string; title: string; cls: string }> = {
  up: { emoji: "🟢", title: "ONLINE CONFIRMADO", cls: "border-success/40 bg-success/5 text-success" },
  investigating: { emoji: "🟡", title: "INVESTIGANDO", cls: "border-warning/40 bg-warning/5 text-warning" },
  possible_down: { emoji: "🟠", title: "POSSÍVEL QUEDA", cls: "border-warning/60 bg-warning/10 text-warning" },
  down: { emoji: "🔴", title: "OFFLINE CONFIRMADO", cls: "border-destructive/40 bg-destructive/5 text-destructive" },
  nodata: { emoji: "⚪", title: "SEM DADOS REGIONAIS", cls: "border-border bg-muted/20 text-muted-foreground" },
};

function verdictSubtitle(v: Verdict): string {
  switch (v.verdict) {
    case "up": return `${v.up} ${v.up === 1 ? "região confirma" : "regiões confirmam"} funcionamento`;
    case "investigating": return "Falha detectada em apenas 1 ponto — sem confirmação de queda";
    case "possible_down": return `${v.down} de ${v.total} regiões detectaram falha`;
    case "down": return `${v.down} de ${v.total} regiões confirmam indisponibilidade`;
    default: return "Nenhuma região reportou nos últimos 15 minutos";
  }
}

function connectionHealth(avg: number | null): { emoji: string; label: string; cls: string } {
  if (avg == null || avg <= 0) return { emoji: "⚪", label: "Sem dados", cls: "text-muted-foreground" };
  if (avg < 300) return { emoji: "🟢", label: "Excelente", cls: "text-success" };
  if (avg < 800) return { emoji: "🟡", label: "Boa", cls: "text-warning" };
  if (avg < 2000) return { emoji: "🟠", label: "Instável", cls: "text-warning" };
  return { emoji: "🔴", label: "Crítica", cls: "text-destructive" };
}

// ---------- Projeção equirretangular (mesma da máscara de terra) ----------
const MAP_W = WORLD_COLS * 10;                      // 1320
const MAP_H = WORLD_ROWS_TOTAL * 10;                // 660
const VIEW_Y = WORLD_ROW_OFFSET * 10;               // corte superior
const VIEW_H = WORLD_MASK.length * 10;              // altura visível
const projX = (lon: number) => ((lon + 180) / 360) * MAP_W;
const projY = (lat: number) => ((90 - lat) / 180) * MAP_H;

export function GlobalCheckMap({ serverId }: { serverId: string }) {
  const [openRegion, setOpenRegion] = useState<string | null>(null);

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["check_regions"],
    queryFn: async () =>
      (await supabase.from("check_regions").select("*").eq("enabled", true).order("longitude")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: verdict } = useQuery<Verdict | null>({
    queryKey: ["region_verdict", serverId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_region_verdict", {
        _server_id: serverId,
        _window_minutes: 15,
      });
      return (data as Verdict) ?? null;
    },
  });

  // Última checagem por região (RPC segura: funciona para o dono e para o admin)
  const { data: matrix = [] } = useQuery<MatrixRow[]>({
    queryKey: ["region_matrix", serverId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_region_matrix", {
        _server_id: serverId,
        _window_minutes: 25,
      });
      return (data as MatrixRow[]) ?? [];
    },
  });

  // Histórico recente para as barrinhas e o modal de detalhes
  const { data: series = [] } = useQuery<RegionCheck[]>({
    queryKey: ["region_series", serverId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_region_series", {
        _server_id: serverId,
        _minutes: 240,
        _limit: 900,
      });
      return (data as RegionCheck[]) ?? [];
    },
  });

  const { data: workers = [] } = useQuery<{ region_code: string; last_report_at: string | null; checks_60s: number }[]>({
    queryKey: ["workers_health"],
    queryFn: async () => (await supabase.rpc("get_workers_health")).data ?? [],
    refetchInterval: 30_000,
  });

  const byRegion = useMemo(() => {
    const m = new Map<string, RegionCheck[]>();
    for (const c of series) {
      const arr = m.get(c.region_code) ?? [];
      arr.push(c);
      m.set(c.region_code, arr);
    }
    return m;
  }, [series]);

  const latestByRegion = useMemo(() => {
    const m = new Map<string, RegionCheck>();
    for (const r of matrix) {
      if (!r.checked_at) continue;
      m.set(r.region_code, {
        region_code: r.region_code,
        status: r.status,
        latency_ms: r.latency_ms,
        http_status: r.http_status,
        error: r.error,
        checked_at: r.checked_at,
        details: r.details,
        source: r.source,
      });
    }
    return m;
  }, [matrix]);

  function effectiveStatus(code: string): { status: string; latest?: RegionCheck } {
    const latest = latestByRegion.get(code);
    if (!latest) return { status: "nodata" };
    if (Date.now() - new Date(latest.checked_at).getTime() > 25 * 60_000) return { status: "nodata", latest };
    return { status: latest.status, latest };
  }

  // Só exibe regiões que realmente possuem um agente conectado (ou dados recentes).
  const liveCodes = useMemo(() => {
    const s = new Set<string>();
    for (const w of workers) {
      if (w.last_report_at && Date.now() - new Date(w.last_report_at).getTime() <= 60 * 60_000) s.add(w.region_code);
    }
    for (const r of matrix) if (r.checked_at) s.add(r.region_code);
    return s;
  }, [workers, matrix]);

  const activeRegions = useMemo(
    () => regions.filter((r) => r.code === "origin" || liveCodes.has(r.code)),
    [regions, liveCodes],
  );

  const nonOrigin = activeRegions.filter((r) => r.code !== "origin");
  const workersOnline = workers.filter((w) => w.last_report_at && Date.now() - new Date(w.last_report_at).getTime() <= 20 * 60_000).length;
  const workersTotal = Math.max(nonOrigin.length, workersOnline);
  const workerBadgeColor =
    workersTotal > 0 && workersOnline === workersTotal ? "text-success border-success/40 bg-success/10" :
    workersOnline === 0 ? "text-destructive border-destructive/40 bg-destructive/10" :
    "text-warning border-warning/40 bg-warning/10";

  const noWorkers = workersOnline === 0;
  const v = verdict ?? null;
  const vui = VERDICT_UI[v?.verdict ?? "nodata"];
  const health = connectionHealth(v?.avg_latency_ms ?? null);
  const selected = openRegion ? regions.find((r) => r.code === openRegion) ?? null : null;

  // Ponto âncora das linhas (origem do servidor) — usa "origin" se existir.
  const anchor = activeRegions.find((r) => r.code === "origin") ?? nonOrigin[0] ?? null;


  return (
    <div className="space-y-4">
      {/* 🧠 Veredito Global do Servidor */}
      <Card className={cn("p-5 border", vui.cls)}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="text-3xl leading-none">{vui.emoji}</div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider opacity-70">Veredito global do servidor</div>
              <div className="text-xl font-semibold">{vui.title}</div>
              <div className="text-sm text-muted-foreground">{v ? verdictSubtitle(v) : "Calculando consenso regional…"}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">⚡ Saúde da conexão</div>
            <div className={cn("text-lg font-semibold", health.cls)}>{health.emoji} {health.label}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {v?.avg_latency_ms ? `${v.avg_latency_ms}ms média entre regiões` : "—"}
            </div>
          </div>
        </div>
        {v && v.total > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {v.regions.map((r) => (
              <button
                key={r.code}
                onClick={() => setOpenRegion(r.code)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs hover:bg-muted/50 transition"
              >
                <span>{r.flag}</span>
                <span className="font-medium">{r.city}</span>
                <span>{r.status === "up" ? "✅" : r.status === "down" ? "❌" : r.status === "degraded" ? "⚠️" : "➖"}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium">Mapa Global de Falhas</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs font-mono", workerBadgeColor)}>
            {workersOnline === workersTotal ? "🟢" : workersOnline === 0 ? "🔴" : "🟡"} {workersOnline}/{workersTotal} Workers Online
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">Realtime</span>
        </div>
      </div>

      {noWorkers && (
        <Card className="p-4 border-warning/40 bg-warning/5">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">⚠️</div>
            <div className="space-y-2 text-sm min-w-0">
              <p className="font-medium">Nenhum ponto regional está reportando ainda.</p>
              <p className="text-muted-foreground">
                O monitoramento multi-região exige agentes rodando fisicamente em cada localidade —
                seja a VPS de São Paulo (<code className="text-xs bg-muted px-1 py-0.5 rounded">vps-agent/</code>)
                ou Cloudflare Workers (<code className="text-xs bg-muted px-1 py-0.5 rounded">docs/regional-workers.md</code>).
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Card className="p-0 overflow-hidden">
          <WorldMap
            regions={nonOrigin}
            anchor={anchor}
            effectiveStatus={effectiveStatus}
            onSelect={setOpenRegion}
          />
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/50">
            Clique em um ponto para ver DNS, HTTP, SSL, Player API e streams.
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Status por região</h3>
          <ul className="space-y-2">
            {activeRegions.map((r) => {
              const { status: s, latest } = effectiveStatus(r.code);
              const hist = (byRegion.get(r.code) ?? []).slice(0, 40).reverse();
              return (
                <li
                  key={r.code}
                  onClick={() => setOpenRegion(r.code)}
                  className="rounded-md border border-border/50 px-3 py-2 space-y-1.5 cursor-pointer hover:bg-muted/40 transition"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg leading-none shrink-0">{r.flag}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.city}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {latest ? `Última verificação: ${humanAgo(latest.checked_at)}` : "sem dados"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs text-muted-foreground">
                        {latest?.latency_ms != null ? `${latest.latency_ms}ms` : "—"}
                      </span>
                      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", dotBg[s])} />
                      <span className="text-xs font-medium w-16 text-right">{statusLabel(s)}</span>
                    </div>
                  </div>
                  {hist.length > 0 && (
                    <div className="flex gap-0.5 h-4">
                      {Array.from({ length: 40 }, (_, i) => {
                        const c = hist[hist.length - 40 + i] ?? null;
                        const cls = !c
                          ? "bg-muted/30"
                          : c.status === "up" ? "bg-success/80"
                          : c.status === "degraded" ? "bg-warning/80"
                          : c.status === "down" ? "bg-destructive/80"
                          : "bg-muted";
                        return (
                          <div
                            key={i}
                            className={cn("flex-1 rounded-sm", cls)}
                            title={c ? `${new Date(c.checked_at).toLocaleTimeString()} — ${statusLabel(c.status)} ${c.latency_ms ?? "-"}ms` : "sem dado"}
                          />
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            <LegendItem status="up" />
            <LegendItem status="degraded" />
            <LegendItem status="down" />
            <LegendItem status="testing" />
            <LegendItem status="nodata" />
          </div>
        </Card>
      </div>

      <RegionStats serverId={serverId} regions={regions} />

      <RegionDetailDialog
        region={selected}
        latest={selected ? latestByRegion.get(selected.code) : undefined}
        history={selected ? byRegion.get(selected.code) ?? [] : []}
        onClose={() => setOpenRegion(null)}
      />
    </div>
  );
}

/** Mapa-múndi em matriz de pontos com halos, arcos e pulsos por status. */
function WorldMap({
  regions,
  anchor,
  effectiveStatus,
  onSelect,
}: {
  regions: Region[];
  anchor: Region | null;
  effectiveStatus: (code: string) => { status: string; latest?: RegionCheck };
  onSelect: (code: string) => void;
}) {
  const dots = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    WORLD_MASK.forEach((row, ri) => {
      const y = (ri + WORLD_ROW_OFFSET) * 10 + 5;
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci] === "1") out.push({ x: ci * 10 + 5, y });
      }
    });
    return out;
  }, []);

  return (
    <div className="relative w-full aspect-[2.44/1] bg-[radial-gradient(120%_120%_at_50%_0%,hsl(var(--primary)/0.10),transparent_60%)]">
      <svg viewBox={`0 ${VIEW_Y} ${MAP_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="gm-glow-up" cx="50%" cy="50%">
            <stop offset="0%" stopColor={STATUS_HEX.up} stopOpacity="0.55" />
            <stop offset="100%" stopColor={STATUS_HEX.up} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gm-glow-down" cx="50%" cy="50%">
            <stop offset="0%" stopColor={STATUS_HEX.down} stopOpacity="0.6" />
            <stop offset="100%" stopColor={STATUS_HEX.down} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gm-glow-degraded" cx="50%" cy="50%">
            <stop offset="0%" stopColor={STATUS_HEX.degraded} stopOpacity="0.5" />
            <stop offset="100%" stopColor={STATUS_HEX.degraded} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="gm-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
            <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.45" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* continentes em matriz de pontos */}
        <g className="fill-foreground/25">
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={3.1} />
          ))}
        </g>

        {/* arcos ligando a origem às regiões */}
        {anchor && regions.map((r) => {
          const x1 = projX(anchor.longitude), y1 = projY(anchor.latitude);
          const x2 = projX(r.longitude), y2 = projY(r.latitude);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.22 - 30;
          return (
            <path
              key={`arc-${r.code}`}
              d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
              fill="none"
              stroke="url(#gm-arc)"
              strokeWidth={2.5}
              strokeDasharray="10 12"
              className="animate-[dash_6s_linear_infinite]"
            />
          );
        })}

        {/* pontos de monitoramento */}
        {regions.map((r) => {
          const x = projX(r.longitude);
          const y = projY(r.latitude);
          const { status: s, latest } = effectiveStatus(r.code);
          const color = STATUS_HEX[s] ?? STATUS_HEX.nodata;
          const glow = s === "down" ? "url(#gm-glow-down)" : s === "degraded" ? "url(#gm-glow-degraded)" : s === "up" ? "url(#gm-glow-up)" : null;
          const active = s === "up" || s === "down" || s === "degraded";
          return (
            <g key={r.code} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => onSelect(r.code)}>
              {glow && <circle r={52} fill={glow} />}
              {active && (
                <circle r={14} fill="none" stroke={color} strokeWidth={2} opacity={0.5} className="origin-center animate-ping" />
              )}
              <circle r={9} fill={color} className="stroke-background" strokeWidth={3} />
              <circle r={3.2} fill="hsl(var(--background))" opacity={0.85} />
              <text y={-24} textAnchor="middle" className="fill-foreground" fontSize={19} fontWeight={600}>
                {r.city}
              </text>
              <text y={-6} textAnchor="middle" className="fill-muted-foreground" fontSize={16} fontFamily="monospace">
                {latest?.latency_ms != null && s !== "nodata" ? `${latest.latency_ms}ms` : statusLabel(s)}
              </text>
              <title>
                {r.flag} {r.city} — {statusLabel(s)}
                {latest?.latency_ms != null ? ` · ${latest.latency_ms}ms` : ""}
                {latest ? ` · ${humanAgo(latest.checked_at)}` : ""}
                {latest?.error ? ` · ${latest.error}` : ""}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RegionDetailDialog({
  region,
  latest,
  history,
  onClose,
}: {
  region: Region | null;
  latest?: RegionCheck;
  history: RegionCheck[];
  onClose: () => void;
}) {
  const current = latest ?? history[0];
  const d = (current?.details ?? {}) as Record<string, any>;
  const health = connectionHealth(current?.latency_ms ?? null);

  return (
    <Dialog open={Boolean(region)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {region?.flag} {region?.city} — {statusLabel(current?.status ?? "nodata")}
          </DialogTitle>
        </DialogHeader>
        {!current ? (
          <p className="text-sm text-muted-foreground">Sem verificações recentes desta região.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <DetailRow label="Latência" value={current.latency_ms != null ? `${current.latency_ms}ms` : "—"} />
              <DetailRow label="Saúde da conexão" value={`${health.emoji} ${health.label}`} />
              <DetailRow label="HTTP/HTTPS" value={current.http_status ? `HTTP ${current.http_status}` : (d.http?.ok ? "OK" : "sem resposta")} />
              <DetailRow label="Última verificação" value={humanAgo(current.checked_at)} />
              <DetailRow
                label="DNS"
                value={d.dns ? (d.dns.ok ? `✅ ${d.dns.ip ?? "resolvido"} (${d.dns.ms}ms)` : `❌ ${d.dns.error ?? "falhou"}`) : "—"}
              />
              <DetailRow
                label="SSL"
                value={d.ssl ? (d.ssl.ok ? `✅ ${d.ssl.days_remaining ?? "?"} dias` : `❌ ${d.ssl.error ?? "falhou"}`) : "—"}
              />
              <DetailRow
                label="Player API"
                value={d.player_api
                  ? `${d.player_api.ok ? "✅" : "❌"} ${d.player_api.login ? "login ok" : "sem login"}${d.player_api.ms ? ` · ${d.player_api.ms}ms` : ""}`
                  : "—"}
              />
              <DetailRow
                label="Stream teste"
                value={d.streams ? `${d.streams.ok}/${d.streams.tested} amostras ok` : "—"}
              />
              <DetailRow label="Origem" value={current.source === "vps" ? "Agente VPS" : current.source ?? "worker"} />
              <DetailRow label="Modo do envio" value={d.mode === "heartbeat" ? "Heartbeat (estável)" : "Detalhado"} />
            </div>
            {current.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">{current.error}</div>
            )}
            <div>
              <div className="text-xs font-medium mb-1">Histórico recente</div>
              <ul className="space-y-1 text-xs font-mono max-h-52 overflow-y-auto">
                {history.slice(0, 30).map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
                    <span>{new Date(h.checked_at).toLocaleString("pt-BR")}</span>
                    <span className="flex items-center gap-2">
                      <span>{h.latency_ms != null ? `${h.latency_ms}ms` : "—"}</span>
                      <span className={cn("inline-block h-2 w-2 rounded-full", dotBg[h.status] ?? dotBg.unknown)} />
                    </span>
                  </li>
                ))}
                {history.length === 0 && <li className="text-muted-foreground">Sem histórico nas últimas 4h.</li>}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm break-words">{value}</div>
    </div>
  );
}

function LegendItem({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-2 w-2 rounded-full", dotBg[status])} />
      <span>{statusLabel(status)}</span>
    </span>
  );
}

function RegionStats({ serverId, regions }: { serverId: string; regions: Region[] }) {
  const { data: stats = [] } = useQuery<StatRow[]>({
    queryKey: ["region_stats", serverId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_region_stats", { _server_id: serverId, _minutes: 1440 });
      return (data as StatRow[]) ?? [];
    },
  });
  const byCode = new Map(stats.map((s) => [s.region_code, s]));

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-medium">📡 Latência por região (24h)</h3>
        <span className="text-xs text-muted-foreground">min · avg · p95 · max</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {regions.map((r) => {
          const s = byCode.get(r.code);
          const h = connectionHealth(s?.avg_ms != null ? Number(s.avg_ms) : null);
          const uptime = s && s.total > 0 ? Math.round((Number(s.ups) / Number(s.total)) * 1000) / 10 : null;
          return (
            <div key={r.code} className="rounded-md border border-border/50 p-3 text-sm">
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <span className="text-lg leading-none shrink-0">{r.flag}</span>
                <span className="font-medium truncate">{r.city}</span>
              </div>
              {!s || s.total === 0 ? (
                <div className="text-xs text-muted-foreground">Sem amostras nas últimas 24h</div>
              ) : (
                <>
                  <div className={cn("text-xs mb-1 font-medium", h.cls)}>
                    {h.emoji} {h.label}{uptime != null ? ` · ${uptime}% uptime` : ""}
                  </div>
                  <div className="grid grid-cols-4 gap-1 font-mono text-xs">
                    <Stat label="min" value={`${s.min_ms ?? "—"}`} />
                    <Stat label="avg" value={`${s.avg_ms ?? "—"}`} />
                    <Stat label="p95" value={`${s.p95_ms ?? "—"}`} />
                    <Stat label="max" value={`${s.max_ms ?? "—"}`} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{s.total} amostras</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 px-1.5 py-1 text-center">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
