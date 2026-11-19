/**
 * Cloudflare-only migration metadata pull. Staging helper; NOT a production sync.
 * Never bind this Worker to streammonitor.site or expose its route publicly.
 * Secrets: SOURCE_EXPORT_TOKEN, SOURCE_EXPORT_URL (exact https URL).
 * No credentials, password hashes, or sessions are requested.
 */
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  },
});

const MODULES = new Set(["profiles", "servers", "subscriptions", "payments"]);

function sourceEndpoint(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") ||
        url.username || url.password || url.search || url.hash ||
        !/^\/functions\/v1\/private-migration-metadata\/?$/.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    // Fail closed: manual execution only; no cron or production route.
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    const control = env.MIGRATION_CONTROL_TOKEN;
    if (!control || control.length < 48 ||
        request.headers.get("authorization") !== `Bearer ${control}`) {
      return reply({ error: "unauthorized" }, 401);
    }
    const endpoint = sourceEndpoint(env.SOURCE_EXPORT_URL);
    if (!endpoint || !env.SOURCE_EXPORT_TOKEN || env.SOURCE_EXPORT_TOKEN.length < 48) {
      return reply({ error: "source_not_configured" }, 503);
    }
    let input;
    try { input = await request.json(); } catch { return reply({ error: "invalid_json" }, 400); }
    if (!MODULES.has(input?.module) || !Number.isSafeInteger(input?.offset) ||
        input.offset < 0 || !Number.isSafeInteger(input?.limit) ||
        input.limit < 1 || input.limit > 50) return reply({ error: "invalid_request" }, 400);
    try {
      const upstream = await fetch(endpoint.toString(), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${env.SOURCE_EXPORT_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ module: input.module, offset: input.offset, limit: input.limit }),
      });
      if (!upstream.ok) return reply({ error: "source_request_failed" }, 502);
      const payload = await upstream.json();
      if (payload?.module !== input.module || payload?.offset !== input.offset ||
          payload?.contains_secrets !== false || !Array.isArray(payload?.records) ||
          payload.records.length > input.limit) return reply({ error: "invalid_source_response" }, 502);
      // Do not return PII through the Worker control endpoint.
      return reply({ ok: true, module: input.module, offset: input.offset,
        records_received: payload.records.length, next_offset: input.offset + payload.records.length,
        complete: payload.records.length < input.limit, persisted: false });
    } catch {
      return reply({ error: "source_unavailable" }, 502);
    }
  },
};
