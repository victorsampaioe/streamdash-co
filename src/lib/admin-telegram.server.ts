// Server-only helper to notify the admin via Telegram (single chat).
// Do NOT import this file from client bundles.

import { formatBRL, effectivePriceCents, PLANS } from "./payments";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

/** Notifica todos os usuários ativos no Telegram sobre incidentes globais importantes. */
export async function broadcastGlobalIncident(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // Apenas usuários ativos (não expirados)
  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .in("status", ["trial", "active"]);
  
  const activeIds = (subs ?? []).map(s => s.user_id);
  if (!activeIds.length) return;

  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .in("owner_id", activeIds)
    .eq("kind", "telegram")
    .eq("enabled", true);
  
  if (!channels?.length) return;

  // Envio em batches para evitar rate limit do Telegram se houver muitos usuários
  for (const ch of channels) {
    const raw = String(ch.target ?? "").trim();
    const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    if (!chatId) continue;
    
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: message, 
        parse_mode: "HTML", 
        disable_web_page_preview: true 
      }),
    }).catch(() => {});
  }
}

export async function notifyAdminSignup(data: { email: string; name: string; phone: string; referralCode?: string }) {
  const text = `🚀 <b>Novo cadastro</b>\n\nNome: ${escape(data.name)}\nE-mail: ${data.email}\nTelefone: ${data.phone}${data.referralCode ? `\nIndicação: ${data.referralCode}` : ""}`;
  return notifyAdmin(text);
}

export async function getReactivationStats() {
  const { data: expiredCount } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id", { count: "exact", head: true })
    .eq("status", "expired");

  const { data: lastCampaign } = await supabaseAdmin
    .from("reactivation_campaign_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const { count: telegramActiveCount } = await supabaseAdmin
    .from("alert_channels")
    .select("*", { count: "exact", head: true })
    .eq("kind", "telegram")
    .eq("enabled", true)
    .in("owner_id", (await supabaseAdmin.from("subscriptions").select("user_id").eq("status", "expired")).data?.map(s => s.user_id) || []);

  return {
    expiredWithTelegram: telegramActiveCount || 0,
    lastSentAt: lastCampaign?.last_sent_at,
    lastMessage: lastCampaign?.last_message,
    totalSent: lastCampaign?.total_sent || 0,
    totalFailed: lastCampaign?.total_failed || 0
  };
}

export async function runReactivationCampaign(manual: boolean = false) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  const { data: expiredSubs } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("status", "expired");

  if (!expiredSubs?.length) return { sent: 0, failed: 0, noTelegram: 0 };

  const userIds = expiredSubs.map(s => s.user_id);

  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("owner_id, target")
    .eq("kind", "telegram")
    .eq("enabled", true)
    .in("owner_id", userIds);

  if (!channels?.length) return { sent: 0, failed: 0, noTelegram: userIds.length };

  const { data: alreadySent } = await supabaseAdmin
    .from("reactivation_logs")
    .select("user_id")
    .eq("status", "success");
  
  const sentSet = new Set(alreadySent?.map(l => l.user_id) || []);
  const targets = channels.filter(c => !sentSet.has(c.owner_id));

  const message = manual 
    ? `🚀 <b>Sentimos sua falta no Stream Monitor!</b>\n\nOlá! 👋\nVimos que sua conta expirou, mas queremos convidar você para voltar a usar o Stream Monitor.\n\nNossa plataforma continua evoluindo com novas ferramentas:\n\n✅ Monitoramento inteligente de servidores\n✅ Alertas automáticos pelo Telegram\n✅ Radar de conteúdos IPTV\n✅ Inteligência para detectar problemas antes das quedas\n✅ Mais controle e segurança para suas operações\n\n🔥 Estamos preparando cada vez mais novidades para nossos usuários.\n\nRenove sua conta e volte a aproveitar todos os recursos do Stream Monitor.\n\n🚀 Sua estrutura merece um monitoramento inteligente!\n\nStream Monitor | Tecnologia e inteligência para monitoramento.`
    : `🚀 <b>Sentimos sua falta no Stream Monitor!</b>\n\nOlá! 👋\nSua assinatura do Stream Monitor expirou, mas você ainda pode voltar a ter acesso a todos os recursos da plataforma.\n\n✅ Monitoramento inteligente de servidores\n✅ Alertas em tempo real pelo Telegram\n✅ Radar de conteúdos IPTV\n✅ Diagnóstico inteligente de falhas\n✅ Mais segurança e controle para suas operações\n\n🔥 Estamos preparando cada vez mais novidades para entregarmos uma ferramenta cada vez mais completa.\n\nVolte agora e continue aproveitando todos os benefícios do Stream Monitor.\n\n👉 Acesse sua conta e renove hoje mesmo!\n\n🚀 Stream Monitor — tecnologia inteligente para monitoramento.`;

  let sent = 0;
  let failed = 0;

  for (const ch of targets) {
    const raw = String(ch.target ?? "").trim();
    const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    if (!chatId) continue;

    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      });

      if (r.ok) {
        sent++;
        await supabaseAdmin.from("reactivation_logs").insert({
          user_id: ch.owner_id,
          status: "success",
          message_version: manual ? "manual" : "auto"
        });
      } else {
        failed++;
        await supabaseAdmin.from("reactivation_logs").insert({
          user_id: ch.owner_id,
          status: "failed",
          error_message: `HTTP ${r.status}`
        });
      }
    } catch (e: any) {
      failed++;
      await supabaseAdmin.from("reactivation_logs").insert({
        user_id: ch.owner_id,
        status: "failed",
        error_message: e?.message || "Erro desconhecido"
      });
    }
  }

  await supabaseAdmin
    .from("reactivation_campaign_settings")
    .update({
      last_sent_at: new Date().toISOString(),
      last_message: message,
      total_sent: sent,
      total_failed: failed
    })
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Update all rows (should only be one)

  return { sent, failed, noTelegram: userIds.length - channels.length, skipped: alreadySent?.length || 0 };
}
