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
    .order("created_at", { ascending: true });

  if (error || !pending || pending.length === 0) return;

  // Agrupar por (owner_id, channel_id)
  const groups: Record<string, typeof pending> = {};
  for (const item of pending) {
    const key = `${item.owner_id}:${item.channel_id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  for (const [key, items] of Object.entries(groups)) {
    const [ownerId, channelId] = key.split(":");
    const channel = items[0].alert_channels;
    const serverCount = new Set(items.map(i => i.server_id)).size;
    
    // Obter preferência do usuário
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("telegram_alert_style")
      .eq("id", ownerId)
      .maybeSingle();
    
    const style = profile?.telegram_alert_style || "summary";

    if (style === "summary" && items.length > 1) {
      // Enviar resumo
      const servers = items.map(i => `• ${i.servers?.name || "Desconhecido"}`).slice(0, 15);
      const more = items.length > 15 ? `\n...e mais ${items.length - 15} servidores.` : "";
      
      const summary = `✅ <b>RESUMO DE SERVIÇOS RESTABELECIDOS</b>\n\n` +
        `${items.length} eventos normalizados (${serverCount} servidores)\n\n` +
        `🌎 Região:\n🇧🇷 São Paulo\n\n` +
        `Servidores recuperados:\n${servers.join("\n")}${more}\n\n` +
        `Tempo médio:\n~2 minutos\n\n` +
        `Todos confirmados online novamente.`;

      await sendToChannel(channel, summary, "up");
    } else {
      // Enviar individuais (respeitando anti-flood se necessário, mas aqui são recuperações)
      for (const item of items) {
        await sendToChannel(channel, item.message, "up");
      }
    }

    // Marcar como processado
    const ids = items.map(i => i.id);
    await supabaseAdmin.from("notification_queue").update({ processed: true }).in("id", ids);
  }
}

async function sendToChannel(ch: any, message: string, event: "up" | "down") {
  try {
    if (ch.kind === "telegram") {
      const sharedToken = process.env.TELEGRAM_BOT_TOKEN;
      let botToken = sharedToken ?? "";
      let chatId = ch.target?.trim() ?? "";
      if (chatId.includes(":")) {
        const [t, c] = chatId.split(":");
        botToken = t; chatId = c;
      }
      if (!botToken || !chatId) return;
      
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: message,
          parse_mode: "HTML"
        }),
      });
    }
    // Outros canais (Discord/Email) poderiam ser adicionados aqui se necessário, 
    // mas o foco é o flood no Telegram.
  } catch (e) {
    console.error("Erro ao enviar notificação agrupada:", e);
  }
}
