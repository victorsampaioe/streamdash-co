// Server-only helper to notify the admin via Telegram (single chat).
// Do NOT import this file from client bundles.

import { formatBRL, effectivePriceCents, PLANS } from "./payments";

export async function notifyAdmin(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: "TELEGRAM_BOT_TOKEN/ADMIN_TELEGRAM_CHAT_ID ausente" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "erro" };
  }
}

async function notifyUserTelegram(userId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .eq("owner_id", userId)
    .eq("kind", "telegram")
    .eq("enabled", true);
  if (!channels?.length) return;
  for (const ch of channels) {
    // Accept "chat_id" or legacy "TOKEN:chat_id" format
    const raw = String(ch.target ?? "").trim();
    const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    if (!chatId) continue;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
    } catch { /* ignore */ }
  }
}

export async function notifyNewlyExpiredSubscriptions(): Promise<{ notified: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: expired, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, plan, expires_at")
    .lt("expires_at", new Date().toISOString())
    .in("status", ["trial", "active"]);
  if (error || !expired?.length) return { notified: 0 };

  let count = 0;
  for (const sub of expired) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", sub.user_id)
      .maybeSingle();
    const label = sub.plan === "trial" ? "Teste gratuito" : `Assinatura ${sub.plan}`;
    await notifyAdmin(
      `⏰ <b>Assinatura expirada</b>\n${label}\n${escape(prof?.full_name ?? "-")} — ${escape(prof?.email ?? "-")}\nVenceu em: ${new Date(sub.expires_at).toLocaleString("pt-BR")}`
    );
    const monthly = PLANS.find((p) => p.id === "monthly")!;
    const yearly = PLANS.find((p) => p.id === "yearly")!;
    const monthlyPrice = formatBRL(effectivePriceCents(monthly));
    const yearlyPrice = formatBRL(effectivePriceCents(yearly));
    // Aviso para o próprio usuário no Telegram dele (se cadastrou canal)
    const userMsg = sub.plan === "trial"
      ? `⏰ <b>Seu teste gratuito expirou</b>\n\nPara continuar monitorando seus servidores, assine agora:\n👉 https://streammonitor.site/app/subscription\n\nPlanos: ${monthlyPrice}/mês ou ${yearlyPrice}/ano (via PIX).`
      : `⏰ <b>Sua assinatura expirou</b>\n\nSeus monitoramentos foram pausados. Renove pelo PIX para reativar:\n👉 https://streammonitor.site/app/subscription\n\nPlanos: ${monthlyPrice}/mês ou ${yearlyPrice}/ano.`;
    await notifyUserTelegram(sub.user_id, userMsg);

    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("user_id", sub.user_id)
      .in("status", ["trial", "active"]);
    count++;
  }
  return { notified: count };
}


function escape(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}
