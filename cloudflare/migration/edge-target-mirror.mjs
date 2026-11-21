/**
 * Read-only shadow of Cloudflare regional probe targets.
 *
 * Authorization, subscription entitlement, the authoritative target list,
 * incident notifications and payment flows remain at the current origin.
 * Never mirror IPTV passwords or user credentials.
 */
export async function mirrorSignedTargets(db, targets, sourceCount) {
  if (!db || !Array.isArray(targets) || !Number.isInteger(sourceCount)
    || targets.length !== sourceCount || targets.length > 3000) return { skipped: "invalid_source" };

  const normalized = [];
  const known = new Set();
  for (const target of targets) {
    const server_id = String(target?.server_id ?? "");
    const host = String(target?.host ?? "").trim();
    // Hostnames and user-visible IPv4+port only; no credentials, URLs or paths.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(server_id)
      || host.length < 3 || host.length > 253
      || !/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)
      || known.has(server_id)) return { skipped: "invalid_target" };
    known.add(server_id);
    normalized.push({ server_id, host });
  }

  normalized.sort((a, b) => a.server_id.localeCompare(b.server_id));
  const hash = [...new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(JSON.stringify(normalized)),
  ))].map(v => v.toString(16).padStart(2, "0")).join("");
  const current = await db.prepare(
    "SELECT snapshot_hash, target_count FROM edge_target_sync_state WHERE id=1",
  ).first();
  if (!current) return { skipped: "not_initialized" };
  if (!normalized.length && Number(current.target_count) > 0)
    return { skipped: "unexpected_empty_source" };

  const now = Date.now();
  if (current.snapshot_hash === hash) {
    await db.prepare(
      "UPDATE edge_target_sync_state SET last_sync_ms=?,target_count=?,last_error=NULL WHERE id=1",
    ).bind(now, normalized.length).run();
    return { ok: true, unchanged: true, count: normalized.length };
  }

  // D1 batch executes transactionally, preventing partial eligibility snapshots.
  await db.batch([
    db.prepare(
      "INSERT INTO edge_target_mirror(server_id,host,active,last_changed_ms,snapshot_hash,source) " +
      "SELECT json_extract(value,'$.server_id'),json_extract(value,'$.host'),1,?,?,'signed_lovable_snapshot' " +
      "FROM json_each(?) WHERE true ON CONFLICT(server_id) DO UPDATE SET " +
      "host=excluded.host,active=1,last_changed_ms=excluded.last_changed_ms,snapshot_hash=excluded.snapshot_hash",
    ).bind(now, hash, JSON.stringify(normalized)),
    db.prepare(
      "UPDATE edge_target_mirror SET active=0,last_changed_ms=?,snapshot_hash=? " +
      "WHERE active=1 AND snapshot_hash<>?",
    ).bind(now, hash, hash),
    db.prepare(
      "UPDATE edge_target_sync_state SET snapshot_hash=?,target_count=?,last_sync_ms=?,last_changed_ms=?,last_error=NULL WHERE id=1",
    ).bind(hash, normalized.length, now, now),
  ]);
  return { ok: true, count: normalized.length, changed: true };
}
