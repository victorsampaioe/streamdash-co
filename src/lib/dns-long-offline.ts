/** Qualification for the DB-managed automatic exclusion at five days offline.
 * Used as defense in depth before the scheduled archive job runs.
 * Archive timestamps, billing, credentials and history are handled by the database.
 */
export const DNS_LONG_OFFLINE_MS = 5 * 24 * 60 * 60 * 1000;
type DnsAgeState = {
  dns_enabled?: boolean | null;
  monitoring_paused?: boolean | null;
  dns_status?: string | null;
  current_status?: string | null;
  dns_state_changed_at?: string | null;
  dns_last_success_at?: string | null;
  dns_last_failure_at?: string | null;
  host_changed_at?: string | null;
  dns_recovery_last_probe_at?: string | null;
  last_dns_check_at?: string | null;
};
function parseMs(date: unknown): number {
  if (typeof date !== "string" || !date) return NaN;
  const result = Date.parse(date);
  return Number.isFinite(result) ? result : NaN;
}
export function isLongOfflineDns(server: DnsAgeState, now = Date.now()): boolean {
  if (server.dns_enabled === false || server.monitoring_paused === true || server.dns_status !== "offline" || server.current_status !== "down") return false;
  const since = parseMs(server.dns_state_changed_at);
  if (!Number.isFinite(since) || since > now || now - since < DNS_LONG_OFFLINE_MS) return false;
  const recovered = parseMs(server.dns_last_success_at);
  if (Number.isFinite(recovered) && recovered >= since) return false;
  const hostChanged = parseMs(server.host_changed_at);
  if (Number.isFinite(hostChanged) && hostChanged > since) return false;
  // The absence of failures cannot prove a long outage.
  const lastFailure = parseMs(server.dns_last_failure_at);
  const lastProbe = parseMs(server.last_dns_check_at);
  return Number.isFinite(lastFailure) && lastFailure >= since && lastFailure <= now
    && now - lastFailure <= 3 * 60 * 60 * 1000
    && Number.isFinite(lastProbe) && now - lastProbe <= 3 * 60 * 60 * 1000;
}
