import { createFileRoute } from "@tanstack/react-router";

/** One-purpose, read-only, signed migration inventory.
 * The key below is PUBLIC. Its private half exists only in the Cloudflare
 * streammonitor-migration-reconcile secret binding.
 * No customer record, credential, token, bank data or email is returned.
 */
const PUBLIC_KEY = {"kty":"EC","key_ops":["verify"],"ext":true,"crv":"P-256","x":"DLVOgguEOh3SHzTZJhJye_J8bj1ajUJIlGSlZjC8n_4","y":"GOVjeYwpDcwXAi9dA8pfZ-mpSsrT78YhDoSL4TyVoo0"};
const KEYS = [
  "profiles", "auth_users", "roles", "servers", "subscriptions", "payments",
  "alert_channels", "telegram_outbox", "credentialed_servers",
] as const;
const PATH = "/api/public/migration/snapshot";
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "null",
};
function blocked() {
  return Response.json({ error: "unauthorized" }, { status: 401, headers: RESPONSE_HEADERS });
}
async function verifyMigrationSigner(request: Request) {
  const timestamp = request.headers.get("x-sm-migration-time") ?? "";
  const signature = request.headers.get("x-sm-migration-signature") ?? "";
  if (!/^\\d{13}$/.test(timestamp) || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const value = Number(timestamp), now = Date.now();
  if (!Number.isSafeInteger(value) || Math.abs(now - value) > 120_000) return false;
  const message = ["streammonitor-migration-snapshot-v2", timestamp, "GET", PATH].join("\\n");
  try {
    const { createPublicKey, verify } = await import("node:crypto");
    const key = createPublicKey({ key: PUBLIC_KEY as any, format: "jwk" });
    return verify("sha256", Buffer.from(message), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "hex"));
  } catch { return false; }
}

async function getCounts(): Promise<Record<(typeof KEYS)[number], number>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tables = [
    ["profiles", "profiles"], ["roles", "user_roles"], ["servers", "servers"],
    ["subscriptions", "subscriptions"], ["payments", "payments"],
    ["alert_channels", "alert_channels"], ["telegram_outbox", "telegram_outbox"],
  ] as const;
  const queries = await Promise.all(tables.map(async ([key, table]) => {
    const { count, error } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true });
    if (error || count == null) throw new Error("migration_count_unavailable_" + key);
    return [key, count] as const;
  }));
  const credentials = await supabaseAdmin.from("servers")
    .select("id", { count: "exact", head: true })
    .or("iptv_username.not.is.null,iptv_password.not.is.null");
  if (credentials.error || credentials.count == null) throw new Error("migration_credential_count_unavailable");
  let users = 0;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users) throw new Error("migration_auth_count_unavailable");
    users += data.users.length;
    if (data.users.length < 1000) break;
    if (page === 10) throw new Error("migration_auth_count_limit");
  }
  const result = Object.fromEntries([...queries,
    ["credentialed_servers", credentials.count], ["auth_users", users]]) as Record<(typeof KEYS)[number], number>;
  for (const key of KEYS) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 0 || result[key] > 10_000_000)
      throw new Error("migration_count_invalid_" + key);
  }
  return result;
}
export const Route = createFileRoute(PATH)({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await verifyMigrationSigner(request)) return blocked();
      try {
        const counts = await getCounts();
        return Response.json({
          ok: true, schema_version: 2, source_time_ms: Date.now(), counts,
          authority: "lovable-cloud", migration_mode: "READ_ONLY",
        }, { headers: RESPONSE_HEADERS });
      } catch {
        return Response.json({ error: "snapshot_unavailable" }, { status: 503, headers: RESPONSE_HEADERS });
      }
    },
  }},
});
