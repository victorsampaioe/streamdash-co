type HistoryPoint = { status: string; checked_at: string; latency_ms: number | null };

/**
 * Draw only real monitoring samples. Empty slots remain neutral; the latest
 * sample animates subtly when fresh (and motion preferences permit).
 * DNS and HTTP are distinctly labelled so DNS doesn't imply IPTV availability.
 */
export function UptimeSparkline({
  checks, source = "HTTP",
}: {
  checks: HistoryPoint[];
  source?: "HTTP" | "DNS";
}) {
  const buckets = 40;
  const points = checks.slice(-buckets);
  const leadingEmpty = buckets - points.length;
  const arr: Array<HistoryPoint | null> = Array.from(
    {length: buckets},
    (_, i) => i < leadingEmpty ? null : points[i - leadingEmpty]
  );
  const lastStamp = points.length ? Date.parse(points[points.length - 1].checked_at) : NaN;
  const newestIsFresh = Number.isFinite(lastStamp) && Date.now() - lastStamp <= 15 * 60_000;
  return (
    <div className="flex h-8 gap-0.5" role="img"
      aria-label={`Últimas ${points.length} medições reais de ${source}; verde: sucesso, amarelo: instável, vermelho: falha`}>
      {arr.map((c, i) => {
        if (!c) return <div key={i} className="flex-1 rounded-sm bg-muted/40" />;
        const cls = c.status === "up" ? "bg-success/80"
          : c.status === "degraded" ? "bg-warning/80"
          : c.status === "down" ? "bg-destructive/80" : "bg-muted";
        const freshNewest = newestIsFresh && i === buckets - 1;
        return (
          <div key={i}
            className={`flex-1 origin-bottom rounded-sm ${cls} opacity-90 transition-[opacity,transform] duration-300 hover:scale-y-110 hover:opacity-100 ${freshNewest ? "motion-safe:animate-pulse" : ""}`}
            title={`${source}: ${new Date(c.checked_at).toLocaleString("pt-BR")} — ${c.status} — ${c.latency_ms ?? "sem latência"} ms`}
          />
        );
      })}
    </div>
  );
}
