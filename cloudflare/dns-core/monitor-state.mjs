/** Pure DNS/HTTP state machine shared by the D1 writer and offline tests. */
export const RECOVERY_MS = 5 * 60_000;
export const CHECK_GAP_MS = 90_000;
export function initialState() {
  return { version: 0, incident: null, dns: initialDimension(), http: initialDimension() };
}
function initialDimension() {
  return { phase: "UNKNOWN", lastAt: 0, recoveryAt: null, successes: 0, proofs: [] };
}
export function publicStatus(dimension) {
  return dimension.phase === "RECOVERING" ? "OFFLINE" : dimension.phase;
}
export function advance(previous, sample, incidentId) {
  if (!["dns", "http"].includes(sample.kind) || !Number.isFinite(sample.at))
    throw new Error("invalid_monitor_sample");
  const state = structuredClone(previous);
  const d = state[sample.kind];
  // Transport replay, same-minute duplication and delayed delivery aren't new evidence.
  if (sample.at <= d.lastAt) return { state: previous, event: null, ignored: true };
  const priorAt = d.lastAt;
  d.lastAt = sample.at;
  const evidence = new Map();
  for (const proof of sample.proofs ?? []) {
    if (typeof proof.source !== "string" || !proof.source || !["ok", "down", "unknown"].includes(proof.verdict)) continue;
    evidence.set(proof.source, proof.verdict);
  }
  const values = [...evidence.values()];
  const healthy = values.length > 0 && values.every(v => v === "ok");
  const failures = [...evidence].filter(([, v]) => v === "down").map(([source]) => source);
  const heldOffline = d.phase === "OFFLINE" || d.phase === "RECOVERING";
  let event = null;
  if (healthy) {
    d.proofs = [];
    if (heldOffline) {
      const continuous = d.recoveryAt !== null && sample.at - priorAt <= CHECK_GAP_MS;
      d.recoveryAt = continuous ? d.recoveryAt : sample.at;
      d.successes = continuous ? d.successes + 1 : 1;
      d.phase = sample.at - d.recoveryAt >= RECOVERY_MS && d.successes >= 6 ? "ONLINE" : "RECOVERING";
    } else {
      d.phase = "ONLINE";
      d.recoveryAt = null;
      d.successes = 0;
    }
  } else {
    d.recoveryAt = null;
    d.successes = 0;
    // Only independent sources with explicit target failures count. Never
    // count an infrastructure timeout, duplicate source or missing sample.
    d.proofs = d.proofs.filter(p => sample.at - p.at <= CHECK_GAP_MS && !evidence.has(p.source));
    d.proofs.push(...failures.map(source => ({ source, at: sample.at })));
    const independent = new Set(d.proofs.map(p => p.source)).size >= 2;
    const hasSuccess = values.includes("ok");
    if (heldOffline) d.phase = "OFFLINE";
    else if (independent && !hasSuccess) d.phase = "OFFLINE";
    else d.phase = failures.length || hasSuccess ? "SUSPECT" : "UNKNOWN";
  }
  if (d.phase === "OFFLINE" && !state.incident) {
    state.incident = { id: incidentId, openedAt: sample.at, kinds: [sample.kind] };
    event = { id: `${incidentId}:down`, incidentId, event: "down", kind: sample.kind, at: sample.at };
  } else if (state.incident && (d.phase === "OFFLINE" || d.phase === "RECOVERING")) {
    if (!state.incident.kinds.includes(sample.kind)) state.incident.kinds.push(sample.kind);
  }
  if (state.incident && state.incident.kinds.every(kind => state[kind].phase === "ONLINE")) {
    const incident = state.incident;
    event = { id: `${incident.id}:recovered`, incidentId: incident.id,
      event: "recovered", kind: incident.kinds.length === 1 ? incident.kinds[0] : "dns_http",
      at: sample.at, openedAt: incident.openedAt };
    state.incident = null;
  }
  state.version++;
  return { state, event, ignored: false };
}

/** Normal lane never loses slots to offline targets; Queue fans out priority. */
export function targetLanes(targets, minute, normalSize = 20) {
  const priority = targets.filter(t => t.priority === true);
  const normal = targets.filter(t => t.priority !== true);
  const slots = Math.max(1, Math.ceil(normal.length / normalSize));
  const slot = minute % slots;
  return { priority, normal: normal.slice(slot * normalSize, (slot + 1) * normalSize) };
}