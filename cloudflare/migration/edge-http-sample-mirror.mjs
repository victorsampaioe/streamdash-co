/**
 * Read-only seven-day shadow of regional HTTP availability checks in Cloudflare D1.
 * Financial data, MACs, IPTV credentials, alert dispatch and user sessions are not stored.
 */
export async function mirrorHttpReport(db, reports, checkedAtMs) {
  if (!db || !Array.isArray(reports) || !reports.length || reports.length > 200
    || !Number.isSafeInteger(checkedAtMs)) return { skipped: "invalid_input" };
  const allowed = new Set(["up", "down", "degraded", "unknown", "pending"]);
  const rows = [];
  const seen = new Set();
  for (const item of reports) {
    const id = String(item?.server_id ?? "");
    const region = String(item?.region_code ?? "");
    const status = String(item?.status ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !region || region.length > 64 || !allowed.has(status)
      || seen.has(id + ":" + region)) return { skipped: "invalid_row" };
    seen.add(id + ":" + region);
    const httpStatus = Number.isInteger(item.http_status) && item.http_status >= 100
      && item.http_status <= 599 ? item.http_status : null;
    const latency = Number.isInteger(item.latency_ms) && item.latency_ms >= 0
      && item.latency_ms <= 120000 ? item.latency_ms : null;
    rows.push({ server_id: id, region_code: region, checked_at_ms: checkedAtMs,
      status, http_status: httpStatus, latency_ms: latency });
  }
  const insert = await db.prepare(
    "INSERT OR IGNORE INTO edge_http_samples(server_id,region_code,checked_at_ms,status,http_status,latency_ms) " +
    "SELECT json_extract(value,'$.server_id'),json_extract(value,'$.region_code')," +
    "json_extract(value,'$.checked_at_ms'),json_extract(value,'$.status')," +
    "json_extract(value,'$.http_status'),json_extract(value,'$.latency_ms') " +
    "FROM json_each(?)",
  ).bind(JSON.stringify(rows)).run();

  // Bounded incremental retention work; the time index avoids scanning all data.
  await db.prepare(
    "DELETE FROM edge_http_samples WHERE id IN " +
    "(SELECT id FROM edge_http_samples WHERE checked_at_ms<? ORDER BY checked_at_ms LIMIT 1500)",
  ).bind(checkedAtMs - 7 * 24 * 60 * 60 * 1000).run();
  return { ok: true, accepted: insert.meta?.changes ?? 0, source_count: rows.length };
}
