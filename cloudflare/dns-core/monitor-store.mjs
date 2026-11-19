import { advance, initialState } from "./monitor-state.mjs";

/** Compare-and-set + incident + event in ONE D1 transactional batch.
 * Losing writers cannot insert notifications. Replays are no-ops. */
export async function recordSample(db, serverId, sample) {
  await db.prepare("INSERT OR IGNORE INTO monitor_state(server_id,version,state_json,updated_at_ms) VALUES(?,0,?,0)")
    .bind(serverId, JSON.stringify(initialState())).run();
  for (let retry = 0; retry < 8; retry++) {
    const row = await db.prepare("SELECT version,state_json FROM monitor_state WHERE server_id=?").bind(serverId).first();
    if (!row) throw new Error("monitor_state_missing");
    const result = advance(JSON.parse(row.state_json), sample, crypto.randomUUID());
    if (result.ignored) return result;
    const version = Number(row.version) + 1;
    const statements = [db.prepare("UPDATE monitor_state SET version=?,state_json=?,updated_at_ms=? WHERE server_id=? AND version=?")
      .bind(version, JSON.stringify(result.state), sample.at, serverId, row.version)];
    const event = result.event;
    if (event?.event === "down") statements.push(db.prepare(
      "INSERT INTO monitor_incidents(id,server_id,opened_at_ms) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM monitor_state WHERE server_id=? AND version=? AND json_extract(state_json,'$.incident.id')=?)")
      .bind(event.incidentId, serverId, event.at, serverId, version, event.incidentId));
    if (event?.event === "recovered") statements.push(db.prepare(
      "UPDATE monitor_incidents SET recovered_at_ms=? WHERE id=? AND recovered_at_ms IS NULL AND EXISTS(SELECT 1 FROM monitor_state WHERE server_id=? AND version=? AND state_json=?)")
      .bind(event.at, event.incidentId, serverId, version, JSON.stringify(result.state)));
    if (event) statements.push(db.prepare(
      "INSERT OR IGNORE INTO monitor_events(id,server_id,incident_id,event,payload,created_at_ms) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitor_state WHERE server_id=? AND version=? AND state_json=?)")
      .bind(event.id, serverId, event.incidentId, event.event, JSON.stringify(event), event.at, serverId, version, JSON.stringify(result.state)));
    const written = await db.batch(statements);
    if (written[0]?.meta?.changes === 1) return result;
  }
  throw new Error("monitor_state_contention");
}

/** Atomic lease used by both cron fallback and Queue consumers. */
export async function claimEvents(db, now, token, limit = 10) {
  // An expired in-flight delivery has unknown outcome; don't blindly resend.
  await db.prepare("UPDATE monitor_events SET status='uncertain',last_error='delivery_outcome_unknown' WHERE status='processing' AND lease_until_ms<?").bind(now).run();
  const rows = await db.prepare(
    "UPDATE monitor_events SET status='processing',claim_token=?,lease_until_ms=?,attempts=attempts+1 WHERE id IN (SELECT id FROM monitor_events WHERE status='pending' AND next_attempt_ms<=? ORDER BY created_at_ms LIMIT ?) AND status='pending' RETURNING *")
    .bind(token, now + 60_000, now, Math.min(20, Math.max(1, limit))).all();
  return rows.results ?? [];
}
export async function settleEvent(db, id, token, outcome, now, retryAfter = 30) {
  if (!["sent", "pending", "uncertain", "dead"].includes(outcome)) throw new Error("invalid_delivery_outcome");
  return db.prepare("UPDATE monitor_events SET status=?,next_attempt_ms=?,lease_until_ms=NULL,claim_token=NULL,last_error=? WHERE id=? AND status='processing' AND claim_token=?")
    .bind(outcome, now + Math.max(1, retryAfter) * 1000, outcome === "sent" ? null : outcome, id, token).run();
}