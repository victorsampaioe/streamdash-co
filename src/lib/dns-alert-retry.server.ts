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


/**
 * Retries real, recently closed DNS incidents that have not been delivered
 * to every enabled Telegram channel. Re-read current state to avoid telling
 * clients "recovered" if the DNS went offline again. Historical closures
 * from days/weeks ago must never trigger misleading retroactive messages.
 */
export async function retryRecoveredDnsAlerts(limit = 5): Promise<{
  found: number; attempted: number; failed: number; skipped: number;
}> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: incidents, error } = await supabaseAdmin.from("incidents")
    .select("id,server_id,started_at,ended_at")
    .eq("incident_type", "dns")
    .not("ended_at", "is", null)
    .gte("ended_at", cutoff)
    .order("ended_at", { ascending: false }).limit(100);
  if (error) throw new Error(`DNS recovery retry: ${error.message}`);
  if (!incidents?.length) return { found: 0, attempted: 0, failed: 0, skipped: 0 };

  const serverIds = [...new Set(incidents.map(i => i.server_id))];
  const { data: servers, error: serverError } = await supabaseAdmin.from("servers")
    .select("id,owner_id,dns_status,dns_enabled,monitoring_paused,last_dns_check_at")
    .in("id", serverIds);
  if (serverError) throw new Error(`DNS recovery state: ${serverError.message}`);
  const byId = new Map((servers ?? []).map(s => [s.id, s]));
  const ids = incidents.map(i => i.id);
  const { data: successful, error: logsError } = await supabaseAdmin.from("notifications_log")
    .select("incident_id,channel_id")
    .eq("event", "tg_dns_online").eq("ok", true).in("incident_id", ids);
  if (logsError) throw new Error(`DNS recovery delivery history: ${logsError.message}`);
  const delivered = new Set((successful ?? []).map(r => `${r.incident_id}:${r.channel_id ?? "admin"}`));

  const { data: attempts, error: attemptError } = await supabaseAdmin.from("notifications_log")
    .select("incident_id,sent_at")
    .eq("event", "tg_dns_online").in("incident_id", ids)
    .order("sent_at", { ascending: false }).limit(600);
  if (attemptError) throw new Error(`DNS recovery attempt history: ${attemptError.message}`);
  const lastAttempt = new Map<string, number>();
  for (const a of attempts ?? []) {
    if (a.incident_id && !lastAttempt.has(a.incident_id)) {
      lastAttempt.set(a.incident_id, new Date(a.sent_at).getTime());
    }
  }
  const { data: channels, error: channelError } = await supabaseAdmin.from("alert_channels")
    .select("id,owner_id").eq("kind", "telegram").eq("enabled", true)
    .in("owner_id", [...new Set((servers ?? []).map(s => s.owner_id))]);
  if (channelError) throw new Error(`DNS recovery channels: ${channelError.message}`);
  const channelsByOwner = new Map<string, string[]>();
  for (const ch of channels ?? []) {
    channelsByOwner.set(ch.owner_id, [...(channelsByOwner.get(ch.owner_id) ?? []), ch.id]);
  }

  const now = Date.now();
  const eligible = incidents.filter(i => {
    const s = byId.get(i.server_id);
    if (!s || s.monitoring_paused || s.dns_enabled === false || s.dns_status !== "online") return false;
    const checked = s.last_dns_check_at ? new Date(s.last_dns_check_at).getTime() : 0;
    const closedAt = i.ended_at ? new Date(i.ended_at).getTime() : 0;
    if (now - checked > 15 * 60_000 || checked < closedAt - 120_000) return false;
    const targets = channelsByOwner.get(s.owner_id) ?? [];
    const customerPending = targets.some(id => !delivered.has(`${i.id}:${id}`));
    const adminPending = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.ADMIN_TELEGRAM_CHAT_ID
      && !delivered.has(`${i.id}:admin`);
    if (!customerPending && !adminPending) return false;
    // Failed Telegram requests should not be repeated every 60 seconds.
    if (now - (lastAttempt.get(i.id) ?? 0) < 5 * 60_000) return false;
    return true;
  });

  const { processTelegramAlert } = await import("./telegram-alerts.server");
  let attempted = 0, failed = 0;
  for (const i of eligible.slice(0, Math.max(1, Math.min(limit, 8)))) {
    attempted++;
    const secs = Math.max(0, Math.round((
      new Date(i.ended_at!).getTime() - new Date(i.started_at).getTime()
    ) / 1000));
    const downtimeLabel = secs < 60 ? `${secs}s`
      : secs < 3600 ? `${Math.round(secs / 60)}min`
      : `${(secs / 3600).toFixed(1)}h`;
    try {
      await processTelegramAlert({
        serverId: i.server_id, incidentId: i.id, kind: "dns",
        event: "ONLINE", timeOffline: downtimeLabel,
        reason: "Recuperação confirmada pelo monitoramento DNS.",
      });
    } catch (err) {
      failed++;
      console.error("[dns-alert-retry] Recovery delivery failed", i.server_id,
        err instanceof Error ? err.name : "unknown");
    }
  }
  return { found: incidents.length, attempted, failed,
    skipped: incidents.length - eligible.length };
}
