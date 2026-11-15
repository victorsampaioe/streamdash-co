/**
 * Public, sanitized read-only status gateway.
 * Exposes ONLY the availability of the public streammonitor.site homepage.
 * Does not return customer names, monitored server data, logs, cookies, IPs,
 * credentials, API tokens, financial data, or original DNS measurements.
 * No POST/PUT/DELETE, no schedules and no production site routes.
 */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60, s-maxage=60",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'",
  },
});
export default {
  async fetch(request, env) {
    if (request.method !== "GET") return json({error:"method_not_allowed"}, 405);
    if (new URL(request.url).pathname !== "/summary") return json({error:"not_found"}, 404);
    if (!env.OBS_DB) return json({error:"database_unavailable"}, 503);
    try {
      const after = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [last, stats] = await Promise.all([
        env.OBS_DB.prepare(
          "SELECT recorded_at,reachable,http_status,latency_ms,error_kind FROM heartbeat_samples WHERE sample_type='scheduled' ORDER BY recorded_at DESC LIMIT 1"
        ).first(),
        env.OBS_DB.prepare(
          "SELECT COUNT(*) AS total, SUM(CASE WHEN reachable=1 THEN 1 ELSE 0 END) AS succeeded, ROUND(AVG(latency_ms),0) AS avg_latency_ms FROM heartbeat_samples WHERE sample_type='scheduled' AND recorded_at>=?"
        ).bind(after).first(),
      ]);
      return json({
        source: "CLOUDFLARE_EDGE_INDEPENDENT",
        target: "streammonitor.site",
        scope: "public_homepage_only",
        last: last
          ? {at:last.recorded_at,online:last.reachable===1,http_status:last.http_status,latency_ms:last.latency_ms,error_kind:last.error_kind}
          : null,
        last24h: {total:Number(stats?.total||0),succeeded:Number(stats?.succeeded||0),average_latency_ms:stats?.avg_latency_ms==null?null:Number(stats.avg_latency_ms)},
      });
    } catch {
      return json({error:"summary_unavailable"}, 503);
    }
  },
};
