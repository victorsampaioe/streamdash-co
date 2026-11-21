/** Five consecutive days of confirmed DNS-offline state.
 * Only affects frequent query scheduling and the dashboard's active list.
 * Servers, billing, credentials and historical events are NEVER deleted.
 */
export const DNS_LONG_OFFLINE_MS = 5 * 24 * 60 * 60 * 1000;
export const DNS_RECOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000;
type DnsAgeState = {
  dns_enabled?: boolean | null;
  monitoring_paused?: boolean | null;
  dns_status?: string | null;
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
  if (server.dns_enabled === false || server.monitoring_paused === true || server.dns_status !== "offline") return false;
  const since = parseMs(server.dns_state_changed_at);
  if (!Number.isFinite(since) || since > now || now - since < DNS_LONG_OFFLINE_MS) return false;
  const recovered = parseMs(server.dns_last_success_at);
  if (Number.isFinite(recovered) && recovered >= since) return false;
  const hostChanged = parseMs(server.host_changed_at);
  if (Number.isFinite(hostChanged) && hostChanged > since) return false;
  // The absence of failures cannot prove a long outage.
  const lastFailure = parseMs(server.dns_last_failure_at);
  return Number.isFinite(lastFailure) && lastFailure >= since && lastFailure <= now;
}
/** The query will be reduced to at most one recovery check every 24 hours. */
export function isDueForLongOfflineRecovery(server: DnsAgeState, now = Date.now()): boolean {
  if (!isLongOfflineDns(server, now)) return false;
  const lastCheck = Math.max(
    Number.isFinite(parseMs(server.last_dns_check_at)) ? parseMs(server.last_dns_check_at) : 0,
    Number.isFinite(parseMs(server.dns_recovery_last_probe_at)) ? parseMs(server.dns_recovery_last_probe_at) : 0,
  );
  return lastCheck > 0 && now - lastCheck >= DNS_RECOVERY_INTERVAL_MS;
}
