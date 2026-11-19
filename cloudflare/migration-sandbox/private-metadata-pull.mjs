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
    if (input.module === 'profiles' && (!env.PILOT_DB || typeof env.PILOT_DB.prepare !== 'function')) return reply({ error: 'staging_database_unavailable' }, 503);
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
      let persisted = false;
      if (input.module === "profiles") {
        // Validate entire batch before any write. Never log profile PII.
        const seen = new Set();
        const rows = payload.records;
        for (const row of rows) {
          if (!row || typeof row.id !== "string" ||
              !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(row.id) || seen.has(row.id) ||
              typeof row.created_at !== "string" ||
              !Number.isSafeInteger(row.credits ?? 0) || (row.credits ?? 0) < 0) {
            return reply({ error: "invalid_profile_batch" }, 502);
          }
          seen.add(row.id);
        }
        const snapshot = "private-metadata-profile-" + new Date().toISOString().slice(0, 10);
        // Stage only. Existing rows retain their IDs; no deletion or production writes.
        const sql = `INSERT INTO migration_users_stage
          (user_id,username,email,display_name,parent_id,owner_account_id,credits,source_updated_at,imported_at,source_snapshot_id)
          VALUES (?,?,?,?,?,?,?,?,datetime('now'),?)
          ON CONFLICT(user_id) DO UPDATE SET
          username=excluded.username,email=excluded.email,display_name=excluded.display_name,
          parent_id=excluded.parent_id,owner_account_id=excluded.owner_account_id,
          credits=excluded.credits,source_updated_at=excluded.source_updated_at,
          imported_at=excluded.imported_at,source_snapshot_id=excluded.source_snapshot_id`;
        if (rows.length) {
          const statements = rows.map(row => env.PILOT_DB.prepare(sql).bind(
            row.id, row.username ?? null, row.email ?? null, row.full_name ?? null,
            row.parent_id ?? null, row.owner_account_id ?? null,
            row.credits ?? 0, row.created_at, snapshot
          ));
          await env.PILOT_DB.batch(statements);
        }
        persisted = true;
      }
      // Do not return PII through the Worker control endpoint.
      return reply({ ok: true, module: input.module, offset: input.offset,
        records_received: payload.records.length, next_offset: input.offset + payload.records.length,
        complete: payload.records.length < input.limit, persisted });
    } catch {
      return reply({ error: "source_unavailable" }, 502);
    }
  },
};
