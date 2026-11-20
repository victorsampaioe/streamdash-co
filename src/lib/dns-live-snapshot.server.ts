import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cloudflare D1 holds the high-frequency DNS probe stream.
 * The old PostgreSQL dns_snapshots history remains immutable. For a healthy
 * Cloudflare edge report, a dedicated snapshot row is created once for each
 * server and then reused so that the existing dashboard can still display
 * fresh resolver details without generating an unbounded history in Lovable.
 *
 * Legacy/fallback/manual probes deliberately keep their original INSERT
 * behaviour. An explicit app_settings gate makes rollout and rollback safe.
 */
async function rollingEdgeHistoryEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.from("app_settings")
      .select("value").eq("key", "cf_dns_history_storage").maybeSingle();
    if (error) return false;
    const value = data?.value as { mode?: string } | null;
    return value?.mode === "rolling_edge_snapshot";
  } catch {
    return false;
  }
}

type Snapshot = {
  server_id: string;
  checked_at: string;
  [field: string]: unknown;
};

async function appendSnapshot(snapshot: Snapshot): Promise<void> {
  const { error } = await (supabaseAdmin as any).from("dns_snapshots").insert(snapshot);
  if (error) throw new Error("dns_snapshot_append_failed");
}

async function updateLiveSnapshot(id: string, snapshot: Snapshot): Promise<void> {
  // Never move the dashboard's latest snapshot backwards if two edge reports
  // race or an older queue item arrives late.
  const { error } = await (supabaseAdmin as any).from("dns_snapshots")
    .update(snapshot).eq("id", id).lte("checked_at", snapshot.checked_at);
  if (error) throw new Error("dns_live_snapshot_update_failed");
}

export async function storeDnsSnapshot(
  snapshot: Snapshot,
  fromCloudflareEdge: boolean,
): Promise<void> {
  if (!fromCloudflareEdge || !(await rollingEdgeHistoryEnabled())) {
    await appendSnapshot(snapshot);
    return;
  }

  const pointers = (supabaseAdmin as any).from("dns_live_snapshot_pointers");
  const { data: existing, error: readError } = await pointers
    .select("snapshot_id").eq("server_id", snapshot.server_id).maybeSingle();
  if (readError) throw new Error("dns_live_snapshot_pointer_read_failed");

  if (existing?.snapshot_id) {
    await updateLiveSnapshot(existing.snapshot_id, snapshot);
    return;
  }

  // First edge report after activation: create a NEW snapshot. Do not turn
  // the last historical row into a mutable one.
  const { data: created, error: createError } = await (supabaseAdmin as any)
    .from("dns_snapshots").insert(snapshot).select("id").single();
  if (createError || !created?.id) throw new Error("dns_live_snapshot_create_failed");

  // A concurrent report may already have created the pointer. The unique
  // server_id claim means only one row becomes the canonical live snapshot.
  const { error: claimError } = await pointers.upsert({
    server_id: snapshot.server_id,
    snapshot_id: created.id,
  }, { onConflict: "server_id", ignoreDuplicates: true });
  if (claimError) throw new Error("dns_live_snapshot_pointer_claim_failed");

  const { data: canonical, error: canonicalError } = await pointers
    .select("snapshot_id").eq("server_id", snapshot.server_id).maybeSingle();
  if (canonicalError || !canonical?.snapshot_id) throw new Error("dns_live_snapshot_pointer_verify_failed");

  if (canonical.snapshot_id !== created.id) {
    // A competing first report won. Remove only our orphan, never history.
    const { error: cleanupError } = await (supabaseAdmin as any)
      .from("dns_snapshots").delete().eq("id", created.id);
    if (cleanupError) throw new Error("dns_live_snapshot_orphan_cleanup_failed");
    await updateLiveSnapshot(canonical.snapshot_id, snapshot);
  }
}
