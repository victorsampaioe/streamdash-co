// Private migration source: deploy only after configuring MIGRATION_EXPORT_TOKEN.
// Never route this function publicly without the bearer token.
// Read-only; never returns passwords, password hashes, or server credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const encoder = new TextEncoder();
async function equalSecret(a: string, b: string) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const aa = new Uint8Array(x);
  const bb = new Uint8Array(y);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  const configured = Deno.env.get("MIGRATION_EXPORT_TOKEN");
  const authorization = request.headers.get("authorization") || "";
  if (!configured || configured.length < 48 ||
      !authorization.startsWith("Bearer ") ||
      !(await equalSecret(authorization.slice(7), configured))) {
    return respond({ error: "unauthorized" }, 401);
  }
  let body: { module?: string; offset?: number; limit?: number };
  try { body = await request.json(); } catch { return respond({ error: "invalid_json" }, 400); }
  if (!["profiles", "servers", "subscriptions", "payments"].includes(body.module || "")) {
    return respond({ error: "unsupported_module" }, 400);
  }
  const offset = body.offset;
  const limit = body.limit;
  if (!Number.isSafeInteger(offset) || offset! < 0 ||
      !Number.isSafeInteger(limit) || limit! < 1 || limit! > 50) {
    return respond({ error: "invalid_pagination" }, 400);
  }
  const fields: Record<string, string> = {
    profiles: "id,username,email,full_name,parent_id,owner_account_id,credits,updated_at,created_at",
    servers: "id,owner_id,name,host,category,current_status,dns_status,created_at,updated_at",
    subscriptions: "id,user_id,plan,status,started_at,expires_at,cancelled_at,updated_at",
    payments: "id,user_id,subscription_id,provider,status,amount_cents,paid_at,updated_at",
  };
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return respond({ error: "source_unavailable" }, 503);
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.from(body.module!).select(fields[body.module!])
    .order("id", { ascending: true }).range(offset!, offset! + limit! - 1);
  if (error) return respond({ error: "source_query_failed" }, 503);
  return respond({ module: body.module, offset, count: data?.length || 0, records: data || [],
    contains_secrets: false });
});
