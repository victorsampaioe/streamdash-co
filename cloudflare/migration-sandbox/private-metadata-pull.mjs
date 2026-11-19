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
const PROFILE_FIELDS = new Set(["id", "username", "email", "full_name", "parent_id", "owner_account_id", "credits", "created_at"]);

function sourceEndpoint(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
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
    if (!env.PILOT_DB || typeof env.PILOT_DB.prepare !== 'function' || typeof env.PILOT_DB.batch !== 'function') return reply({ error: 'staging_database_unavailable' }, 503);
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
          if (!row || typeof row !== "object" || Array.isArray(row) ||
              Object.keys(row).some(key => !PROFILE_FIELDS.has(key)) ||
              typeof row.id !== "string" ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id) || seen.has(row.id) ||
              typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) ||
              ["username","email","full_name","parent_id","owner_account_id"].some(key =>
                row[key] != null && (typeof row[key] !== "string" || row[key].length > 320)) ||
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
      if (input.module !== "profiles") {
        // Allowlisted metadata only. Reject unexpected columns before any staging writes.
        const definitions = {
          servers: {
            fields: ["id","owner_id","name","host","category","current_status","dns_status","created_at","updated_at"],
            required: ["id","owner_id"],
            sql: `INSERT INTO migration_servers_stage
              (server_id,owner_id,name,host,category,current_status,dns_status,created_at,updated_at,source_snapshot_id)
              VALUES (?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(server_id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,
              host=excluded.host,category=excluded.category,current_status=excluded.current_status,
              dns_status=excluded.dns_status,created_at=excluded.created_at,
              updated_at=excluded.updated_at,source_snapshot_id=excluded.source_snapshot_id`,
          },
          subscriptions: {
            fields: ["id","user_id","plan","status","started_at","expires_at","cancelled_at","updated_at"],
            required: ["id","user_id","plan","status","updated_at"],
            sql: `INSERT INTO migration_subscriptions_stage
              (subscription_id,user_id,plan,status,started_at,expires_at,cancelled_at,source_updated_at,source_snapshot_id)
              VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(subscription_id) DO UPDATE SET user_id=excluded.user_id,plan=excluded.plan,
              status=excluded.status,started_at=excluded.started_at,expires_at=excluded.expires_at,
              cancelled_at=excluded.cancelled_at,source_updated_at=excluded.source_updated_at,
              source_snapshot_id=excluded.source_snapshot_id`,
          },
          payments: {
            fields: ["id","user_id","subscription_id","provider","status","amount_cents","paid_at","updated_at"],
            required: ["id","user_id","status","amount_cents","updated_at"],
            sql: `INSERT INTO migration_payments_stage
              (payment_id,user_id,subscription_id,provider,status,amount_cents,paid_at,source_updated_at,source_snapshot_id)
              VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(payment_id) DO UPDATE SET user_id=excluded.user_id,
              subscription_id=excluded.subscription_id,provider=excluded.provider,
              status=excluded.status,amount_cents=excluded.amount_cents,paid_at=excluded.paid_at,
              source_updated_at=excluded.source_updated_at,source_snapshot_id=excluded.source_snapshot_id`,
          },
        };
        const def = definitions[input.module];
        const seen = new Set();
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        for (const row of payload.records) {
          if (!row || typeof row !== "object" || Array.isArray(row) ||
              Object.keys(row).some(key => !def.fields.includes(key)) ||
              def.required.some(key => row[key] === null || row[key] === undefined) ||
              !uuid.test(row.id) || seen.has(row.id) ||
              !uuid.test(row[input.module === "servers" ? "owner_id" : "user_id"]) ||
              (input.module === "payments" && (!Number.isSafeInteger(row.amount_cents) || row.amount_cents < 0)) ||
              def.fields.some(key => key !== "amount_cents" &&
                row[key] != null && (typeof row[key] !== "string" || row[key].length > 2048))) {
            return reply({ error: "invalid_metadata_batch" }, 502);
          }
          seen.add(row.id);
        }
        const snapshot = "private-metadata-" + input.module + "-" + new Date().toISOString().slice(0, 10);
        if (payload.records.length) {
          const statements = payload.records.map(row => env.PILOT_DB.prepare(def.sql).bind(
            ...def.fields.map(key => row[key] ?? null), snapshot
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
