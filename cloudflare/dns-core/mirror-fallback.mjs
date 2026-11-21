/**
 * Read-only emergency inventory from the last signed Cloudflare D1 mirror.
 *
 * The source (Lovable/PostgreSQL) remains authoritative for subscriptions,
 * enrollment, payments, ownership and Telegram delivery. This function is
 * deliberately incapable of creating users, changing eligibility or sending
 * notifications. Its only purpose is to keep edge probes running temporarily
 * when the source cannot be reached.
 */
export const MAX_MIRROR_AGE_MS = 72 * 60 * 60 * 1000;

export function mirrorFresh(snapshot, now = Date.now()) {
  const last = Number(snapshot?.last_sync_ms);
  const count = Number(snapshot?.target_count);
  return Number.isSafeInteger(last) && Number.isSafeInteger(count)
    && count > 0 && count <= 3000 && last <= now + 60_000
    && last > now - MAX_MIRROR_AGE_MS;
}

export async function readMirrorTargets(db, now = Date.now()) {
  if (!db || typeof db.prepare !== "function")
    throw new Error("mirror_database_unavailable");
  const snapshot = await db.prepare(
    "SELECT target_count,last_sync_ms FROM edge_target_sync_state WHERE id=1"
  ).first();
  if (!mirrorFresh(snapshot, now)) throw new Error("mirror_missing_or_expired");
  const result = await db.prepare(
    "SELECT m.server_id,m.host,COALESCE(t.source_status,'unknown') AS source_status," +
    " c.checked_at_ms,c.status AS last_status " +
    "FROM edge_target_mirror m " +
    "LEFT JOIN dns_targets t ON t.server_id=m.server_id " +
    "LEFT JOIN dns_current c ON c.server_id=m.server_id " +
    "WHERE m.active=1 ORDER BY m.server_id"
  ).all();
  const targets = result?.results;
  if (!Array.isArray(targets) || targets.length !== Number(snapshot.target_count))
    throw new Error("mirror_inventory_incomplete");
  const known = new Set();
  for (const row of targets) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(row?.server_id ?? "")) ||
       !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(String(row?.host ?? "")) ||
        known.has(row.server_id)) throw new Error("mirror_invalid_target");
    known.add(row.server_id);
  }
  return targets;
}


/**
 * DNS checks use their own signed, previously validated inventory. The HTTP
 * mirror intentionally has a different eligibility scope and cannot replace
 * the complete DNS inventory.
 */
export async function readCachedDnsTargets(db, now = Date.now()) {
  if (!db || typeof db.prepare !== "function")
    throw new Error("dns_cache_unavailable");
  const meta = await db.prepare(
    "SELECT value FROM dns_worker_meta WHERE key='last_inventory_success'"
  ).first();
  const last = Number(meta?.value);
  if (!Number.isSafeInteger(last) || last > now + 60_000 ||
      last <= now - MAX_MIRROR_AGE_MS)
    throw new Error("dns_cache_missing_or_expired");
  const result = await db.prepare(
    "SELECT t.server_id,t.host,t.source_status,c.checked_at_ms,c.status AS last_status " +
    "FROM dns_targets t LEFT JOIN dns_current c ON c.server_id=t.server_id " +
    "WHERE t.active=1 ORDER BY t.server_id LIMIT 3001"
  ).all();
  const rows = result?.results;
  if (!Array.isArray(rows) || !rows.length || rows.length>3000)
    throw new Error("dns_cache_invalid_count");
  const known = new Set();
  for(const row of rows){
    const id=String(row?.server_id??"");
    const host=String(row?.host??"");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || host.length<3 || host.length>512 || known.has(id))
      throw new Error("dns_cache_invalid_target");
    known.add(id);
  }
  return rows;
}
