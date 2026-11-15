/**
 * Stream Monitor Cloudflare Migration Sandbox
 * ISOLATED / READ ONLY / SYNTHETIC DATA ONLY
 * Never route this Worker to streammonitor.site or grant real data bindings.
 */
const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Content-Security-Policy": "default-src 'none'",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: securityHeaders });

const queries = Object.freeze({
  "/demo/status": "SELECT captured_at,servers_total,servers_online,servers_offline,servers_degraded,incidents_open,telegram_pending,avg_latency_ms FROM pilot_platform_health_snapshots WHERE record_source = ? ORDER BY captured_at DESC LIMIT 1",
  "/demo/platform-health-v2": "SELECT captured_at,servers_total,servers_online,servers_offline,servers_paused,dns_unresolved,avg_latency_ms,incidents_open,telegram_pending,telegram_failed_24h,subscriptions_active,servers_degraded FROM pilot_v2_platform_health_snapshots WHERE record_source = ? ORDER BY captured_at DESC LIMIT 1",
  "/demo/checks-hourly": "SELECT server_id,hour,total,ups,degraded,downs,avg_latency_ms,max_latency_ms,min_latency_ms,ssl_days_remaining,created_at,first_detector_region FROM pilot_checks_hourly WHERE record_source = ? ORDER BY hour DESC LIMIT 1",
  "/demo/region-hourly": "SELECT server_id,region_code,hour,total,ups,downs,avg_latency_ms,max_latency_ms,created_at FROM pilot_v2_region_checks_hourly WHERE record_source = ? ORDER BY hour DESC LIMIT 1",
});

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const { pathname } = new URL(request.url);
    if (pathname !== "/health" && !Object.hasOwn(queries, pathname)) {
      return json({ error: "not_found" }, 404);
    }
    if (!env.PILOT_DB || typeof env.PILOT_DB.prepare !== "function") {
      return json({ ok: false, error: "pilot_database_unavailable" }, 503);
    }
    try {
      if (pathname === "/health") {
        const row = await env.PILOT_DB.prepare(
          "SELECT COUNT(*) AS samples FROM pilot_platform_health_snapshots WHERE record_source = ?"
        ).bind("SYNTHETIC").first();
        return json({
          ok: true,
          environment: "isolated_migration_pilot",
          production: false,
          data_type: "synthetic_only",
          d1_connected: true,
          synthetic_samples: Number(row?.samples || 0),
        });
      }
      const row = await env.PILOT_DB.prepare(queries[pathname])
        .bind("SYNTHETIC").first();
      if (!row) return json({ ok: false, error: "no_synthetic_sample" }, 404);
      return json({
        ok: true,
        environment: "isolated_migration_pilot",
        production: false,
        data_type: "synthetic_only",
        result: row,
      });
    } catch {
      return json({ ok: false, error: "pilot_database_query_failed" }, 503);
    }
  },
};
