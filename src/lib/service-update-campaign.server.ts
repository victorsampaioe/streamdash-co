import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runPool } from "./pool";

/**
 * One-time service announcement to users who intentionally enabled a Telegram
 * notification channel. Expired customers receive a single relevant renewal
 * reminder, never a payment demand or unsolicited promotional sequence.
 *
 * Delivery is deduplicated by (campaign event, channel_id), with a DB-backed
 * cycle lock at the authenticated endpoint. No credentials leave the server.
 */
const CAMPAIGN = "stream-monitor-improvements-2026-11";
const ACTIVE_EVENT = "service_update_202611_active";
const EXPIRED_EVENT = "service_update_202611_expired";

type Subscriber = {
  user_id: string;
  status: string;
  expires_at: string | null;
  updated_at: string;
};
type Channel = { id: string; owner_id: string; target: string };
type Target = { channel: Channel; audience: "active" | "expired"; event: string };

const ACTIVE_MESSAGE = [
  "🔵 <b>STREAM MONITOR — ATUALIZAÇÕES IMPORTANTES</b>",
  "",
  "Estamos melhorando sua experiência com o monitoramento:",
  "✅ DNS offline identificado separadamente do estado do servidor IPTV.",
  "🔔 Correções nos avisos Telegram de queda e recuperação.",
  "⚡ Verificações mais leves e redução de alertas repetidos.",
  "🛡 Melhorias de segurança, cadastro e organização do painel.",
  "",
  "📊 Veja as novidades no painel:",
  "https://streammonitor.site/app",
  "",
  "O tempo de detecção depende da rede e das verificações realizadas.",
  "Para não receber comunicados, desative o canal Telegram nas configurações de alertas.",
].join("\n");

const EXPIRED_MESSAGE = [
  "🔵 <b>STREAM MONITOR — TEMOS NOVIDADES PARA VOCÊ!</b>",
  "",
  "O Stream Monitor recebeu melhorias na identificação de DNS offline,",
  "nos alertas de queda e recuperação pelo Telegram e no desempenho do painel.",
  "",
  "⏳ Sua assinatura anterior está expirada. Se quiser voltar a monitorar",
  "seus servidores, você pode renovar diretamente no site:",
  "",
  "💳 <b>Veja os planos e renove:</b>",
  "https://streammonitor.site/app/subscription",
  "",
  "Se você já renovou, desconsidere este aviso e confira sua assinatura no painel.",
  "Para não receber novos comunicados, desative o Telegram nas configurações de alertas.",
].join("\n");

export async function sendServiceUpdateCampaign(): Promise<{
  campaign: string;
  audience: { active: number; expired: number; excluded: number };
  alreadySent: number;
  attempted: number;
  delivered: number;
  failed: number;
  skippedPaid: number;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado.");
  const { data: rawChannels, error: chError } = await supabaseAdmin.from("alert_channels")
    .select("id,owner_id,target")
    .eq("kind", "telegram").eq("enabled", true)
    .order("created_at", { ascending: true }).limit(2000);
  if (chError) throw new Error(chError.message);
  const channels = (rawChannels ?? []).filter(ch => /^-?\d{5,20}$/.test((ch.target ?? "").trim())) as Channel[];
  const userIds = [...new Set(channels.map(ch => ch.owner_id))];
  if (!userIds.length) return {
    campaign: CAMPAIGN, audience: { active: 0, expired: 0, excluded: 0 },
    alreadySent: 0, attempted: 0, delivered: 0, failed: 0, skippedPaid: 0,
  };

  const { data: subs, error: subError } = await supabaseAdmin.from("subscriptions")
    .select("user_id,status,expires_at,updated_at")
    .in("user_id", userIds)
    .order("expires_at", { ascending: false, nullsFirst: false });
  if (subError) throw new Error(subError.message);
  const latest = new Map<string, Subscriber>();
  for (const item of (subs ?? []) as Subscriber[]) {
    if (!latest.has(item.user_id)) latest.set(item.user_id, item);
  }
  const { data: recentPayments, error: paymentError } = await supabaseAdmin.from("payments")
    .select("user_id,status,payment_type,paid_at")
    .in("user_id", userIds).eq("status", "approved").eq("payment_type", "subscription")
    .order("paid_at", { ascending: false }).limit(500);
  if (paymentError) throw new Error(paymentError.message);
  const paidAtByUser = new Map<string, number>();
  for (const payment of recentPayments ?? []) {
    if (payment.paid_at && !paidAtByUser.has(payment.user_id)) {
      paidAtByUser.set(payment.user_id, new Date(payment.paid_at).getTime());
    }
  }

  const now = Date.now();
  const targets: Target[] = [];
  let excluded = 0;
  let skippedPaid = 0;
  let active = 0, expired = 0;
  for (const ch of channels) {
    const sub = latest.get(ch.owner_id);
    if (!sub) { excluded++; continue; }
    const expiry = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
    if (sub.status === "active" && expiry > now) {
      targets.push({ channel: ch, audience: "active", event: ACTIVE_EVENT }); active++;
    } else if (sub.status === "expired" && expiry <= now) {
      // Do not ask someone to renew if a later approved payment suggests the
      // subscription is only waiting for payment activation/reconciliation.
      if ((paidAtByUser.get(ch.owner_id) ?? 0) > expiry) { skippedPaid++; continue; }
      targets.push({ channel: ch, audience: "expired", event: EXPIRED_EVENT }); expired++;
    } else {
      excluded++;
    }
  }

  const ids = targets.map(t => t.channel.id);
  const deliveredBefore = new Set<string>();
  if (ids.length) {
    const { data: previous, error: logError } = await supabaseAdmin.from("notifications_log")
      .select("channel_id,event")
      .in("channel_id", ids)
      .in("event", [ACTIVE_EVENT, EXPIRED_EVENT]).eq("ok", true);
    if (logError) throw new Error(logError.message);
    for (const row of previous ?? []) {
      if (row.channel_id) deliveredBefore.add(`${row.channel_id}|${row.event}`);
    }
  }
  const queued = targets.filter(t => !deliveredBefore.has(`${t.channel.id}|${t.event}`));
  const results = await runPool(queued, async (item) => {
    const message = item.audience === "active" ? ACTIVE_MESSAGE : EXPIRED_MESSAGE;
    let ok = false;
    let response = "unknown_error";
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: item.channel.target.trim(),
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const body = await r.json().catch(() => null) as { ok?: boolean } | null;
      ok = r.ok && body?.ok === true;
      response = ok ? "telegram_accepted" : `telegram_http_${r.status}`;
    } catch (err) {
      response = err instanceof Error && err.name === "TimeoutError" ? "telegram_timeout" : "telegram_network_error";
    }
    const { error } = await supabaseAdmin.from("notifications_log").insert({
      channel_id: item.channel.id, server_id: null, incident_id: null,
      event: item.event, ok, response,
    });
    if (error) console.error("[service-campaign] Failed to persist delivery result", error.code);
    return ok;
  }, { concurrency: 3, jitterMs: 350 });

  return {
    campaign: CAMPAIGN, audience: { active, expired, excluded },
    alreadySent: targets.length - queued.length,
    attempted: queued.length,
    delivered: results.filter(r => r.status === "fulfilled" && r.value === true).length,
    failed: results.filter(r => r.status === "rejected" || r.value !== true).length,
    skippedPaid,
  };
}
