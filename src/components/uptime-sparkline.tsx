export function UptimeSparkline({ checks }: { checks: Array<{ status: string; checked_at: string; latency_ms: number | null }> }) {
  const buckets = 40;
  const arr = Array.from({ length: buckets }, (_, i) => checks[i]);
  return (
    <div className="flex gap-0.5 h-8">
      {arr.map((c, i) => {
        if (!c) return <div key={i} className="flex-1 rounded-sm bg-muted/40" />;
        const cls = c.status === "up" ? "bg-success/80" : c.status === "degraded" ? "bg-warning/80" : c.status === "down" ? "bg-destructive/80" : "bg-muted";
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${cls} hover:opacity-100 opacity-90 transition-opacity`}
            title={`${new Date(c.checked_at).toLocaleTimeString()} — ${c.status} ${c.latency_ms ?? "-"}ms`}
          />
        );
      })}
    </div>
  );
}
