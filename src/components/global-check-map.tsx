import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusDot, StatusLabel } from "@/components/status-dot";
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
  unknown: "fill-muted-foreground",
  pending: "fill-muted-foreground/50",
};

/**
 * Global Failure Map — shows a simple equirectangular world with a colored
 * dot for each configured monitoring region and its latest status/latency
 * for a given server. Public-safe: only queries data the caller can read
 * per RLS (owner or public server).
 */
export function GlobalCheckMap({ serverId }: { serverId: string }) {
  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["check_regions"],
    queryFn: async () =>
      (await supabase.from("check_regions").select("*").eq("enabled", true).order("longitude")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: latest = [] } = useQuery<RegionCheck[]>({
    queryKey: ["region_checks_latest", serverId],
    queryFn: async () => {
      // Grab last 200 rows and pick the most recent per region on the client.
      const { data } = await supabase
        .from("region_checks")
        .select("region_code,status,latency_ms,http_status,error,checked_at")
        .eq("server_id", serverId)
        .order("checked_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const latestByRegion = new Map<string, RegionCheck>();
  for (const c of latest) if (!latestByRegion.has(c.region_code)) latestByRegion.set(c.region_code, c);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <Card className="p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-medium">Mapa Global de Falhas</h3>
          <span className="text-xs text-muted-foreground">Atualiza a cada 10s</span>
        </div>
        <div className="relative w-full aspect-[2/1] rounded-md overflow-hidden bg-muted/20 border border-border/50">
          <svg viewBox="0 0 800 400" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border/40" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="800" height="400" fill="url(#grid)" />
            {/* very rough continent silhouettes as backdrop */}
            <g className="fill-muted/40">
              <ellipse cx="200" cy="180" rx="90" ry="70" />
              <ellipse cx="230" cy="290" rx="55" ry="90" />
              <ellipse cx="420" cy="170" rx="80" ry="55" />
              <ellipse cx="470" cy="260" rx="55" ry="65" />
              <ellipse cx="600" cy="180" rx="120" ry="70" />
              <ellipse cx="680" cy="290" rx="60" ry="45" />
            </g>
            {regions.filter((r) => r.code !== "origin").map((r) => {
              const x = ((r.longitude + 180) / 360) * 800;
              const y = ((90 - r.latitude) / 180) * 400;
              const c = latestByRegion.get(r.code);
              const s = c?.status ?? "pending";
              const colorClass = statusColor[s] ?? statusColor.pending;
              return (
                <g key={r.code} transform={`translate(${x},${y})`}>
                  {s === "up" && <circle r="14" className="fill-success/20 animate-ping" />}
                  <circle r="7" className={cn(colorClass, "stroke-background")} strokeWidth={2} />
                  <text y="-12" textAnchor="middle" className="fill-foreground text-[10px] font-medium">
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
            const c = latestByRegion.get(r.code);
            const s = c?.status ?? "pending";
            return (
              <li key={r.code} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg leading-none">{r.flag}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.city}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{r.country}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-xs text-muted-foreground">
                    {c?.latency_ms != null ? `${c.latency_ms}ms` : s === "pending" ? "aguardando worker" : "—"}
                  </span>
                  <StatusDot status={s} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <LegendItem status="up" label="OK" />
          <LegendItem status="degraded" label="Degradado" />
          <LegendItem status="down" label="Falha" />
          <LegendItem status="pending" label="Sem worker" />
        </div>
      </Card>
    </div>
  );
}

function LegendItem({ status, label }: { status: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusDot status={status} />
      <StatusLabel status={status} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
