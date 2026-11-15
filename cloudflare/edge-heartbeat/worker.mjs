/**
 * Stream Monitor / Cloudflare edge heartbeat.
 * Independently checks only the public https://streammonitor.site/ homepage.
 * Never stores response bodies, user data, IP addresses, cookies, server credentials,
 * DNS catalogs, or customer/billing records. NO Telegram or production API writes.
 * No workers.dev/public route in steady state: scheduled() only.
 */
const TARGET = "https://streammonitor.site/";
const DB_TARGET = "streammonitor.site";
const SOURCE = "CLOUDFLARE_EDGE_INDEPENDENT";
const INTERVAL_MS = 10 * 60_000;
const RETENTION_MS = 14 * 24 * 60 * 60_000;

// This is a one-off staging switch and MUST remain false in source/production.
// The first verification deployment uses a temporary replacement of this value
// and is immediately followed by a deployment with it disabled.
const MANUAL_TEST_ENABLED = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "content-security-policy": "default-src 'none'",
    },
  });
}

async function observe(env, sampleType, time = Date.now()) {
  if (!env.OBS_DB) throw new Error("Observer D1 binding is missing");
  const bucketStart = new Date(Math.floor(time / INTERVAL_MS) * INTERVAL_MS).toISOString();
  const recordedAt = new Date().toISOString();
  const started = Date.now();
  let httpStatus = null;
  let errorKind = null;
  let reachable = 0;

  try {
    const response = await fetch(TARGET, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html",
        "Cache-Control": "no-cache",
        "User-Agent": "StreamMonitor-Edge-Heartbeat/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });
    httpStatus = response.status;
    const type = response.headers.get("content-type") || "";
    reachable = response.status === 200 && type.includes("text/html") ? 1 : 0;
    if (!reachable) errorKind = response.status !== 200 ? "unexpected_status" : "unexpected_type";
    if (response.body) await response.body.cancel().catch(() => {});
  } catch (error) {
    errorKind = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "timeout" : "network_error";
  }
  const latency = Math.min(30_000, Math.max(0, Date.now() - started));

  await env.OBS_DB.prepare(
    `INSERT OR IGNORE INTO heartbeat_samples
      (bucket_start,recorded_at,target,reachable,http_status,latency_ms,error_kind,source,sample_type)
     VALUES(?,?,?,?,?,?,?,?,?)`
  ).bind(bucketStart, recordedAt, DB_TARGET, reachable, httpStatus,
    latency, errorKind, SOURCE, sampleType).run();

  // Delete only our own stale, derived observations. Never touch source records.
  if (new Date(time).getUTCMinutes() === 0) {
    await env.OBS_DB.prepare("DELETE FROM heartbeat_samples WHERE bucket_start < ?")
      .bind(new Date(time - RETENTION_MS).toISOString()).run();
  }
  return { ok: true, source: SOURCE, target: DB_TARGET, reachable: Boolean(reachable),
    http_status: httpStatus, latency_ms: latency, error_kind: errorKind, sample_type: sampleType };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(observe(env, "scheduled", controller.scheduledTime));
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (MANUAL_TEST_ENABLED && request.method === "POST"
        && pathname === "/__internal_probe_test"
        && request.headers.get("x-sm-test") === "enabled") {
      try { return json(await observe(env, "manual_test")); }
      catch { return json({ ok: false, error: "test_failed" }, 503); }
    }
    if (request.method === "GET" && pathname === "/__health") {
      try {
        const row = await env.OBS_DB.prepare(
          "SELECT COUNT(*) AS total, MAX(recorded_at) AS last_check FROM heartbeat_samples"
        ).first();
        return json({ ok: true, isolated: true, status: "read_only_probe",
          checks: Number(row?.total || 0), last_check: row?.last_check || null });
      } catch {
        return json({ ok: false, error: "db_unavailable" }, 503);
      }
    }
    return json({ error: "not_found" }, 404);
  },
};
