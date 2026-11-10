import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Agrupa notificações de recuperação pendentes e as envia.
 * Chamado via cron a cada 10 minutos.
 */
export async function flushNotificationQueue() {
  const { data: pending, error } = await supabaseAdmin
    .from("notification_queue")
    .select("*, alert_channels(*), servers(*)")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) throw new Error(`Falha ao buscar fila de notificações: ${error.message}`);
  if (!pending?.length) return { sent: 0, failed: 0 };

  // Agrupar por (owner_id, channel_id)
  const groups: Record<string, typeof pending> = {};
  for (const item of pending) {
    const key = `${item.owner_id}:${item.channel_id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  let sent = 0;
  let failed = 0;
  for (const [key, items] of Object.entries(groups)) {
    const [ownerId] = key.split(":");
    const channel = items[0].alert_channels;
    if (!channel) { failed += items.length; continue; }
    const serverCount = new Set(items.filter(i => !i.event.startsWith("referral_")).map(i => i.server_id)).size;
    
    // Obter preferência do usuário
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("telegram_alert_style")
      .eq("id", ownerId)
      .maybeSingle();
    
    const style = profile?.telegram_alert_style || "summary";

    const successfullyDelivered: string[] = [];

    // Comunicados institucionais não são eventos de recuperação.
    // Enviar cada um integralmente, sem agrupá-los no resumo de servidores.
    const announcements = items.filter(i => i.event.startsWith("referral_"));
    for (const item of announcements) {
      if (await sendToChannel(channel, item.message, "up")) successfullyDelivered.push(item.id);
    }
    const recoveryItems = items.filter(i => !i.event.startsWith("referral_"));

    if (style === "summary" && recoveryItems.length > 1) {
      // Enviar resumo
      const esc = (s: unknown) => String(s ?? "Desconhecido").replace(/[<>&]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]!);
      const servers = recoveryItems.map(i => `• ${esc(i.servers?.name)}`).slice(0, 15);
      const more = recoveryItems.length > 15 ? `\n...e mais ${recoveryItems.length - 15} servidores.` : "";
      
      const summary = `✅ <b>RESUMO DE SERVIÇOS RESTABELECIDOS</b>\n\n` +
        `${recoveryItems.length} eventos normalizados (${serverCount} servidores)\n\n` +
        `🌎 Região:\n🇧🇷 São Paulo\n\n` +
        `Servidores recuperados:\n${servers.join("\n")}${more}\n\n` +
        `Confira o histórico e o tempo exato de recuperação no painel.`;

      if (await sendToChannel(channel, summary, "up")) successfullyDelivered.push(...recoveryItems.map(i => i.id));
    } else {
      // Enviar individuais (respeitando anti-flood se necessário, mas aqui são recuperações)
      for (const item of recoveryItems) {
        if (await sendToChannel(channel, item.message, "up")) successfullyDelivered.push(item.id);
      }
    }

    // Marcar como processado
    if (successfullyDelivered.length) {
      const { error: updateError } = await supabaseAdmin.from("notification_queue")
        .update({ processed: true }).in("id", successfullyDelivered);
      if (updateError) throw new Error(`Não foi possível confirmar notificações: ${updateError.message}`);
    }
    sent += successfullyDelivered.length;
    failed += items.length - successfullyDelivered.length;
  }
  return { sent, failed };
}


/**
 * Dispara exclusivamente a campanha Indique e Ganhe; não toca na fila
 * antiga de recuperação para não avisar quedas históricas.
 * Chamado por um cron dedicado em pequenos lotes.
 */
export async function flushReferralLaunchCampaign(limit = 8) {
  const { data: pending, error } = await supabaseAdmin
    .from("notification_queue")
    .select("id,owner_id,channel_id,message,alert_channels(*)")
    .in("event", ["referral_launch_20261109", "referral_trial_20261110"])
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(10, limit)));
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const item of pending ?? []) {
    const channel = item.alert_channels;
    if (!channel || channel.enabled !== true || channel.kind !== "telegram") {
      failed++;
      continue;
    }
    const ok = await sendToChannel(channel, item.message, "up");
    if (!ok) { failed++; continue; }
    const { error: updateError } = await supabaseAdmin.from("notification_queue")
      .update({ processed: true }).eq("id", item.id).eq("processed", false);
    if (updateError) throw updateError;
    sent++;
  }
  const { count, error: countError } = await supabaseAdmin.from("notification_queue")
    .select("id", { count: "exact", head: true })
    .in("event", ["referral_launch_20261109", "referral_trial_20261110"])
    .eq("processed", false);
  if (countError) throw countError;
  return { sent, failed, pending: count ?? 0 };
}

async function sendToChannel(ch: any, message: string, _event: "up" | "down"): Promise<boolean> {
  try {
    if (ch.kind === "telegram") {
      const sharedToken = process.env.TELEGRAM_BOT_TOKEN;
      let botToken = sharedToken ?? "";
      let chatId = ch.target?.trim() ?? "";
      if (chatId.includes(":")) {
        const [t, c] = chatId.split(":");
        botToken = t; chatId = c;
      }
      if (!botToken || !chatId) return false;
      
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: message,
          parse_mode: "HTML"
        }),
      });
      if (!response.ok) {
        console.error("[notification-queue] Telegram recusou notificação", response.status);
        return false;
      }
      return true;
    }
    // Canais não implementados não são marcados como entregues.
    return false;
  } catch (e) {
    console.error("Erro ao enviar notificação agrupada:", e);
    return false;
  }
}

export async function notifyUserActivation(userId: string, planName: string) {
  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .eq("owner_id", userId)
    .eq("kind", "telegram")
    .eq("enabled", true);

  if (!channels || channels.length === 0) return;

  const planLabel = planName === "yearly" ? "Anual" : (planName === "monthly" ? "Mensal" : planName);
  
  const message = `✅ <b>Stream Monitor</b>\n\nSua assinatura foi confirmada!\n\nPlano: ${planLabel}\nStatus: Ativo\nAcesso liberado.`;

  for (const ch of channels) {
    await sendToChannel({ kind: "telegram", target: ch.target }, message, "up");
  }
}

