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

/**
 * Aviso único no Telegram para contas com acesso encerrado
 * (teste ou assinatura expirada, revendedor sem créditos).
 * Registra em `expiry_notices` para nunca repetir o aviso.
 */
export const EXPIRED_ACCESS_MESSAGE =
  "⚠️ <b>Seu acesso expirou</b>\n\n" +
  "Olá! Identificamos que seu período de teste/assinatura do Stream Monitor foi encerrado.\n\n" +
  "Seu monitoramento foi pausado automaticamente.\n\n" +
  "Seus DNS continuam salvos e serão reativados assim que sua assinatura for renovada.\n\n" +
  "🚀 Renove agora para continuar utilizando todos os recursos do sistema:\n" +
  "👉 https://streammonitor.site/app/subscription";

export async function notifyExpiredAccessUsers(): Promise<{ sent: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getActiveOwnerIds } = await import("./service-status.server");

  // Somente usuários que têm canal de Telegram habilitado
  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("owner_id")
    .eq("kind", "telegram")
    .eq("enabled", true);
  const candidates = Array.from(new Set((channels ?? []).map((c: any) => c.owner_id as string)));
  if (!candidates.length) return { sent: 0, skipped: 0 };

  // Remove quem já recebeu o aviso
  const { data: already } = await supabaseAdmin
    .from("expiry_notices")
    .select("user_id")
    .eq("kind", "expired_access")
    .in("user_id", candidates);
  const notified = new Set((already ?? []).map((r: any) => r.user_id as string));

  const active = await getActiveOwnerIds(candidates);
  const targets = candidates.filter((id) => !notified.has(id) && !active.has(id));

  let sent = 0;
  for (const userId of targets) {
    await notifyUserTelegram(userId, EXPIRED_ACCESS_MESSAGE);
    const { error } = await supabaseAdmin
      .from("expiry_notices")
      .insert({ user_id: userId, kind: "expired_access" });
    if (!error) sent++;
  }

  // Contas que voltaram a ficar ativas podem receber o aviso novamente no futuro
  const reactivated = candidates.filter((id) => active.has(id) && notified.has(id));
  if (reactivated.length) {
    await supabaseAdmin
      .from("expiry_notices")
      .delete()
      .eq("kind", "expired_access")
      .in("user_id", reactivated);
  }

  return { sent, skipped: targets.length - sent };
}
