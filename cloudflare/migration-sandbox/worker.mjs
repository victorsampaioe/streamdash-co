/**
 * Stream Monitor Cloudflare Migration Sandbox
 * ISOLATED / READ ONLY / SYNTHETIC DATA ONLY
 * This Worker must NOT be routed to streammonitor.site.
 * It has no access to Lovable Cloud or real customer information.
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

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const { pathname } = new URL(request.url);
    if (!["/health", "/demo/status"].includes(pathname)) {
      return json({ error: "not_found" }, 404);
    }
    if (!env.PILOT_DB || typeof env.PILOT_DB.prepare !== "function") {
      return json({ ok: false, error: "pilot_database_unavailable" }, 503);
    }
    try {
      if (pathname === "/health") {
        const row = await env.PILOT_DB.prepare(
          "SELECT count(*) AS samples FROM pilot_platform_health_snapshots WHERE record_source = ?"
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
      const row = await env.PILOT_DB.prepare(
        "SELECT captured_at,servers_total,servers_online,servers_offline,servers_degraded,incidents_open,telegram_pending,avg_latency_ms FROM pilot_platform_health_snapshots WHERE record_source = ? ORDER BY captured_at DESC LIMIT 1"
      ).bind("SYNTHETIC").first();
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
