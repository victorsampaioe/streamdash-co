import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Independent delivery loop: a slow DNS / WHOIS probe cannot suppress an
 * already-confirmed outage notification. It only reads verified server state.
 * Per-recipient idempotency lives in processTelegramAlert.
 */
export async function retryConfirmedDnsAlerts(limit = 5): Promise<{
  attempted: number; failed: number; skipped: number; found: number; failureReasons?: string[];
}> {
  const { data: incidents, error } = await supabaseAdmin.from("incidents")
    .select("id, server_id, last_check_at")
    .eq("incident_type", "dns")
    .is("ended_at", null)
    .order("last_check_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(`DNS alert retry: ${error.message}`);
  if (!incidents?.length) return { attempted: 0, failed: 0, skipped: 0, found: 0 };

  const serverIds = [...new Set(incidents.map(i => i.server_id))];
  const { data: servers, error: serverError } = await supabaseAdmin.from("servers")
    .select("id, dns_status, dns_enabled, monitoring_paused, last_dns_check_at")
    .in("id", serverIds);
  if (serverError) throw new Error(`DNS retry state: ${serverError.message}`);
  const byId = new Map((servers ?? []).map(s => [s.id, s]));
  const incidentIds = incidents.map(i => i.id);
  const { data: previous, error: logsError } = await supabaseAdmin.from("notifications_log")
    .select("incident_id, sent_at")
    .eq("event", "tg_dns_offline")
    .in("incident_id", incidentIds)
    .order("sent_at", { ascending: false })
    .limit(600);
  if (logsError) throw new Error(`DNS retry log: ${logsError.message}`);

  const latestAttempt = new Map<string, number>();
  for (const log of previous ?? []) {
    if (!log.incident_id || latestAttempt.has(log.incident_id)) continue;
    latestAttempt.set(log.incident_id, new Date(log.sent_at).getTime());
  }
  const now = Date.now();
  const eligible = incidents.filter(i => {
    const s = byId.get(i.server_id);
    if (!s || s.monitoring_paused || s.dns_enabled === false || s.dns_status !== "offline") return false;
    if (!s.last_dns_check_at || now - new Date(s.last_dns_check_at).getTime() > 15 * 60_000) return false;
    // Avoid retry storms when Telegram is rate-limiting or unreachable.
    const last = latestAttempt.get(i.id) ?? 0;
    return now - last >= 5 * 60_000;
  }).sort((a, b) =>
    (latestAttempt.get(a.id) ?? 0) - (latestAttempt.get(b.id) ?? 0)
  );
  const { processTelegramAlert } = await import("./telegram-alerts.server");
  let attempted = 0, failed = 0;
  const failureReasons = new Set<string>();
  for (const i of eligible.slice(0, Math.max(1, Math.min(limit, 8)))) {
    attempted++;
    try {
      await processTelegramAlert({
        serverId: i.server_id, incidentId: i.id, kind: "dns",
        event: "OFFLINE",
        reason: "DNS continua offline, confirmado por verificações recentes.",
      });
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message.slice(0, 170) : "unknown";
      failureReasons.add(reason);
      console.error("[dns-alert-retry] Falha ao entregar", i.server_id, reason);
    }
  }
  return { attempted, failed, skipped: incidents.length - eligible.length, found: incidents.length, failureReasons: [...failureReasons].slice(0, 3) };
}
