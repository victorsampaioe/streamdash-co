/**
 * Stream Monitor: independent, low-cost Cloudflare edge probe.
 * Cloudflare cron does NOT guarantee physical São Paulo placement.
 * Dedicated agent identity + HMAC, no IPTV credentials in this runtime.
 *
 * Env: ENDPOINT_BASE, SIGNING_KEY_JWK, REGION_CODE.
 * SIGNING_KEY_JWK must match the server-side Lovable secret.
 * Cron: every minute; limit 20 targets, 1 targets call, 1 report call.
 */
const MAX_TARGETS = 20;
const CONCURRENCY = 5;
const TIMEOUT = 6500;

async function sign(env, message) {
  // Private signing key is a Cloudflare secret binding. The Lovable Cloud
  // stores only the public JWK, so no cross-platform shared secret is copied.
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.SIGNING_KEY_JWK),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" },
    key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function config(env) {
  if (!env.ENDPOINT_BASE || !env.SIGNING_KEY_JWK || !env.REGION_CODE)
    throw new Error("Worker configuration incomplete");
  if (new URL(env.ENDPOINT_BASE).protocol !== "https:") throw new Error("HTTPS required");
}

async function jsonOrFail(res) {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`HTTP ${res.status}`);
  return body;
}

async function getTargets(env) {
  const message = "targets";
  return (await jsonOrFail(await fetch(`${env.ENDPOINT_BASE}/api/public/regions/targets`, {
    headers: { "x-cf-signature": await sign(env, message) },
    signal: AbortSignal.timeout(TIMEOUT),
  }))).targets ?? [];
}

function safeUrl(host) {
  const raw = String(host ?? "").trim();
  // Accept domains, IPv4, optional explicit port; never credentials or paths.
  if (!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(raw)) return null;
  const url = new URL("http://" + raw + "/");
  if (url.username || url.password) return null;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127|0|10|192\.168|169\.254|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return null;
  if (![80,8080,8000,8880,2052,2082,2086,2095].includes(Number(url.port || "80"))) return null;
  return url.toString();
}

async function check(target, region) {
  const started = Date.now();
  let status = "unknown", http_status = null, error = null;
  const url = safeUrl(target.host);
  if (!url) {
    return { server_id: target.server_id, region_code: region, status,
      latency_ms: 0, http_status, error: "Endereço não suportado pelo Worker",
      source: "worker" };
  }
  try {
    const res = await fetch(url, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT),
      headers: { "user-agent": "StreamMonitor-CF-Edge/1.0" },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    http_status = res.status;
    if (res.body) await res.body.cancel().catch(() => {});
    const elapsed = Date.now() - started;
    status = http_status >= 200 && http_status < 400 ? elapsed > 3000 ? "degraded" : "up"
      : http_status === 401 || http_status === 403 || http_status === 404 || http_status === 429
        ? "degraded" : http_status >= 500 ? "down" : "unknown";
  } catch (e) {
    status = "down";
    error = e?.name === "TimeoutError" ? "Timeout de conexão" : "Falha de conexão HTTP";
  }
  return { server_id: target.server_id, region_code: region, status,
    http_status, latency_ms: Date.now() - started, error, source: "worker" };
}

async function pool(targets, region) {
  const result = new Array(targets.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      result[i] = await check(targets[i], region);
    }
  }));
  return result;
}


async function tick(env) {
  config(env);
  const all = await getTargets(env);
  if (!Array.isArray(all)) throw new Error("Invalid target list");
  if (all.length === 0) {
    return { ok: true, targets: 0, checked: 0, reported: 0 };
  }
  const totalSlots = Math.ceil(all.length / MAX_TARGETS);
  const slot = Math.floor(Date.now() / 60000) % totalSlots;
  const targets = all.slice(slot * MAX_TARGETS, (slot + 1) * MAX_TARGETS);
  const reports = await pool(targets, env.REGION_CODE);
  const body = JSON.stringify({ reports });
  const signature = await sign(env, body);
  const reply = await jsonOrFail(await fetch(`${env.ENDPOINT_BASE}/api/public/regions/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cf-signature": signature },
    body, signal: AbortSignal.timeout(15000),
  }));
  return { ok: true, targets: all.length, checked: targets.length, reported: reply.inserted ?? 0, slot: slot + 1, totalSlots };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env).then(result => console.log("monitor tick", result))
      .catch(e => console.error("monitor tick failed", String(e?.message ?? e))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({
      service: "Stream Monitor Cloudflare Edge", region: env.REGION_CODE ?? "unconfigured",
      location: "Cloudflare edge (not guaranteed São Paulo)", configured: !!env.SIGNING_KEY_JWK,
    });
    // Only scheduled cron can initiate probes, never an anonymous HTTP caller.
    return new Response("Not found", { status: 404 });
  },
};
