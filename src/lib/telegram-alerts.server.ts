import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AlertEvent = "OFFLINE" | "ONLINE" | "UNSTABLE";

export interface AlertData {
  serverId: string;
  incidentId?: string;
  event: AlertEvent;
  reason?: string;
  confirmNote?: string;
  timeOffline?: string;
  regions?: string[];
}

/**
 * Motor central de notificações Telegram.
 * Garante que alertas sejam enviados apenas baseados no estado real do banco.
 */
export async function processTelegramAlert(data: AlertData) {
  const { serverId, incidentId, event, reason, confirmNote, regions } = data;

  // 1. Buscar dados do servidor e dono (Fonte única de verdade)
  const { data: server, error: sErr } = (await (supabaseAdmin as any)
    .from("servers")
    .select("*, profiles(*)")
    .eq("id", serverId)
    .maybeSingle()) as { data: any; error: any };

  if (sErr || !server) {
    console.error(`[TelegramAlert] Servidor ${serverId} não encontrado.`);
    return;
  }

  // 2. Verificar idempotência para evitar spam
  // Se for queda, a chave é baseada no incidentId. Se for retorno, também.
  if (incidentId) {
    const idempotencyKey = `tg_alert_${incidentId}_${event.toLowerCase()}`;
    const { error: idError } = await supabaseAdmin
      .from("alert_idempotency" as any)
      .insert({ id: idempotencyKey });

    if (idError) {
      console.log(`[TelegramAlert] Alerta ${event} para incidente ${incidentId} já enviado. Pulando.`);
      return;
    }
  }

  // 3. Formatar Mensagem Padronizada
  const message = formatAlertMessage(server, data);

  // 4. Enviar para canais do usuário
  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("*")
    .eq("owner_id", server.owner_id)
    .eq("kind", "telegram")
    .eq("enabled", true);

  if (channels && channels.length > 0) {
    await Promise.allSettled(channels.map(ch => sendToTelegram(ch.target, message)));
  }

  // 5. Enviar cópia para o Admin (Monitoramento Central)
  await notifyAdminAlert(server, data, message);
}

function formatAlertMessage(server: any, data: AlertData): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR");
  
  const esc = (s: any) => String(s ?? "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

  if (data.event === "OFFLINE") {
    return (
      `🚨 <b>Stream Monitor - OFFLINE CONFIRMADO</b>\n\n` +
      `<b>Servidor:</b> ${esc(server.name)}\n` +
      `<b>Status:</b> 🔴 OFFLINE\n` +
      `<b>Motivo:</b> ${esc(data.reason)}\n` +
      `<b>Regiões que confirmaram:</b> ${data.regions?.join(", ") || "🇧🇷 São Paulo (VPS)"}\n` +
      `<b>Horário:</b> ${timeStr} (${dateStr})\n` +
      `<b>Revendedor:</b> ${esc(server.profiles?.full_name)}\n` +
      `<b>Host:</b> <code>${esc(server.host)}</code>\n` +
      `<b>IPTV configurado:</b> ${server.iptv_username ? "Sim ✅" : "Não ❌"}`
    );
  } else if (data.event === "ONLINE") {
    return (
      `✅ <b>SERVIDOR RESTABELECIDO</b>\n\n` +
      `<b>Servidor:</b> ${esc(server.name)}\n` +
      `<b>Status:</b> 🟢 ONLINE\n` +
      `<b>Tempo offline:</b> ${data.timeOffline || "N/A"}\n` +
      `<b>Horário do retorno:</b> ${timeStr}\n` +
      `<b>Host:</b> <code>${esc(server.host)}</code>\n\n` +
      `O serviço foi validado em múltiplas regiões e está operando normalmente.`
    );
  }

  return `⚠️ <b>Aviso Stream Monitor</b>: ${esc(server.name)} - ${data.event}`;
}

async function sendToTelegram(target: string, text: string) {
  const sharedToken = process.env.TELEGRAM_BOT_TOKEN;
  let botToken = sharedToken ?? "";
  let chatId = target?.trim() ?? "";
  
  if (chatId.includes(":")) {
    const [t, c] = chatId.split(":");
    botToken = t; chatId = c;
  }

  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error("[TelegramAlert] Erro ao enviar para Telegram:", e);
  }
}

async function notifyAdminAlert(server: any, data: AlertData, userMessage: string) {
  const adminToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!adminToken || !adminChatId) return;

  const adminMsg = `🛡 <b>ADMIN LOG - MONITOR</b>\n` +
    `Usuário: ${server.profiles?.email || "N/A"}\n` +
    `ID Servidor: <code>${server.id}</code>\n\n` +
    userMessage;

  try {
    await fetch(`https://api.telegram.org/bot${adminToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: adminChatId, text: adminMsg, parse_mode: "HTML" }),
    });
  } catch {}
}

/**
 * Função para testes manuais via Painel Admin
 */
export async function sendTestAlert(userId: string, event: AlertEvent = "OFFLINE") {
  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (!server) throw new Error("Usuário não possui servidores para teste.");

  await processTelegramAlert({
    serverId: server.id,
    event,
    reason: "Teste manual via painel admin",
    regions: ["Teste-Local"],
    timeOffline: event === "ONLINE" ? "5 minutos" : undefined
  });
}
