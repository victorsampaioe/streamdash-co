import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
};

const statusColor: Record<string, string> = {
  up: "fill-success",
  degraded: "fill-warning",
  down: "fill-destructive",
  testing: "fill-primary",
  unknown: "fill-muted-foreground",
  nodata: "fill-muted-foreground/40",
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

export function GlobalCheckMap({ serverId }: { serverId: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["check_regions"],
    queryFn: async () =>
      (await supabase.from("check_regions").select("*").eq("enabled", true).order("longitude")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: checks = [], refetch } = useQuery<RegionCheck[]>({
    queryKey: ["region_checks_series", serverId],
    queryFn: async () => {
      const { data } = await supabase
        .from("region_checks")
        .select("region_code,status,latency_ms,http_status,error,checked_at")
        .eq("server_id", serverId)
        .order("checked_at", { ascending: false })
        .limit(600);
      return data ?? [];
    },
  });

  // Realtime: append on insert
  useEffect(() => {
    const ch = supabase
      .channel(`region_checks_${serverId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "region_checks", filter: `server_id=eq.${serverId}` },
        () => refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverId, refetch]);

  // Global worker heartbeat
  const { data: workers = [] } = useQuery<{ region_code: string; last_report_at: string | null; checks_60s: number }[]>({
    queryKey: ["workers_health"],
    queryFn: async () => (await supabase.rpc("get_workers_health")).data ?? [],
    refetchInterval: 15_000,
  });

  const byRegion = useMemo(() => {
    const m = new Map<string, RegionCheck[]>();
    for (const c of checks) {
      const arr = m.get(c.region_code) ?? [];
      arr.push(c);
      m.set(c.region_code, arr);
    }
    return m;
  }, [checks]);

  const latestByRegion = useMemo(() => {
    const m = new Map<string, RegionCheck>();
    for (const [code, arr] of byRegion) m.set(code, arr[0]);
    return m;
  }, [byRegion]);

  // Compute effective status for a region using both latest sample age and worker heartbeat.
  function effectiveStatus(code: string): { status: string; latest?: RegionCheck } {
    const latest = latestByRegion.get(code);
    if (!latest) return { status: "nodata" };
    // If sample older than 3 minutes, treat as no data (stale).
    if (Date.now() - new Date(latest.checked_at).getTime() > 3 * 60_000) return { status: "nodata", latest };
    return { status: latest.status, latest };
  }

  const nonOrigin = regions.filter((r) => r.code !== "origin");
  const workersOnline = workers.filter((w) => w.last_report_at && Date.now() - new Date(w.last_report_at).getTime() <= 60_000).length;
  const workersTotal = nonOrigin.length;
  const workerBadgeColor =
    workersOnline === workersTotal ? "text-success border-success/40 bg-success/10" :
    workersOnline === 0 ? "text-destructive border-destructive/40 bg-destructive/10" :
    "text-warning border-warning/40 bg-warning/10";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium">Mapa Global de Falhas</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs font-mono", workerBadgeColor)}>
            {workersOnline === workersTotal ? "🟢" : workersOnline === 0 ? "🔴" : "🟡"} {workersOnline}/{workersTotal} Workers Online
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">Realtime</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Card className="p-4">
          <div className="relative w-full aspect-[2/1] rounded-md overflow-hidden bg-muted/20 border border-border/50">
            <svg viewBox="0 0 800 400" className="absolute inset-0 w-full h-full">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border/40" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="800" height="400" fill="url(#grid)" />
              <g className="fill-muted/40">
                <ellipse cx="200" cy="180" rx="90" ry="70" />
                <ellipse cx="230" cy="290" rx="55" ry="90" />
                <ellipse cx="420" cy="170" rx="80" ry="55" />
                <ellipse cx="470" cy="260" rx="55" ry="65" />
                <ellipse cx="600" cy="180" rx="120" ry="70" />
                <ellipse cx="680" cy="290" rx="60" ry="45" />
              </g>
              {nonOrigin.map((r) => {
                const x = ((r.longitude + 180) / 360) * 800;
                const y = ((90 - r.latitude) / 180) * 400;
                const { status: s, latest } = effectiveStatus(r.code);
                const colorClass = statusColor[s] ?? statusColor.nodata;
                const isDown = s === "down";
                return (
                  <g key={r.code} transform={`translate(${x},${y})`}>
                    {(s === "up" || isDown) && (
                      <circle
                        r={isDown ? 18 : 14}
                        className={cn(isDown ? "fill-destructive/25" : "fill-success/20", "animate-ping")}
                      />
                    )}
                    <circle r={isDown ? 9 : 7} className={cn(colorClass, "stroke-background")} strokeWidth={2}>
                      <title>
                        {r.flag} {r.city} — {statusLabel(s)}
                        {latest?.latency_ms != null ? ` · ${latest.latency_ms}ms` : ""}
                        {latest ? ` · ${humanAgo(latest.checked_at)}` : ""}
                        {latest?.error ? ` · ${latest.error}` : ""}
                      </title>
                    </circle>
                    <text y="-14" textAnchor="middle" className="fill-foreground text-[10px] font-medium">
                      {r.flag} {r.city}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Status por região</h3>
          <ul className="space-y-2">
            {regions.map((r) => {
              const { status: s, latest } = effectiveStatus(r.code);
              const series = (byRegion.get(r.code) ?? []).slice(0, 40).reverse();
              return (
                <li key={r.code} className="rounded-md border border-border/50 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg leading-none">{r.flag}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.city}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {latest ? humanAgo(latest.checked_at) : "sem dados"}
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
                  {series.length > 0 && (
                    <div className="flex gap-0.5 h-4">
                      {Array.from({ length: 40 }, (_, i) => {
                        const c = series[series.length - 40 + i] ?? null;
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

      <RegionStats serverId={serverId} regions={nonOrigin} byRegion={byRegion} tickKey={tick} />
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

function RegionStats({
  regions,
  byRegion,
}: {
  serverId: string;
  regions: Region[];
  byRegion: Map<string, RegionCheck[]>;
  tickKey: number;
}) {
  // Compute min/max/avg/p95 from the last 60min of samples per region on the client.
  const rows = regions.map((r) => {
    const cutoff = Date.now() - 60 * 60_000;
    const arr = (byRegion.get(r.code) ?? [])
      .filter((c) => new Date(c.checked_at).getTime() >= cutoff && c.latency_ms != null)
      .map((c) => c.latency_ms as number)
      .sort((a, b) => a - b);
    if (arr.length === 0) return { r, count: 0 };
    const min = arr[0];
    const max = arr[arr.length - 1];
    const avg = Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
    const p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
    return { r, count: arr.length, min, max, avg, p95 };
  });
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium">Latência por região (última hora)</h3>
        <span className="text-xs text-muted-foreground">min · avg · p95 · max</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {rows.map(({ r, count, min, max, avg, p95 }) => (
          <div key={r.code} className="rounded-md border border-border/50 p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg leading-none">{r.flag}</span>
              <span className="font-medium">{r.city}</span>
            </div>
            {count === 0 ? (
              <div className="text-xs text-muted-foreground">Sem amostras na última hora</div>
            ) : (
              <div className="grid grid-cols-4 gap-1 font-mono text-xs">
                <Stat label="min" value={`${min}ms`} />
                <Stat label="avg" value={`${avg}ms`} />
                <Stat label="p95" value={`${p95}ms`} />
                <Stat label="max" value={`${max}ms`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
