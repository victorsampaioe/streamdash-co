import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AlertEvent = "OFFLINE" | "ONLINE" | "UNSTABLE";

export interface AlertData {
  serverId: string;
  incidentId?: string;
  kind?: "server" | "dns";
  suppressAdminCopy?: boolean;
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
  const { serverId, incidentId, event } = data;
  // "servers.owner_id" não tem FK direta para "profiles" no banco do
  // Lovable: um join PostgREST profiles(...) faz TODOS os alertas falharem.
  const { data: server, error: sErr } = await supabaseAdmin
    .from("servers")
    .select("id, owner_id, name, host, iptv_username")
    .eq("id", serverId)
    .maybeSingle();
  if (sErr || !server) throw new Error(`Não foi possível consultar o servidor do alerta: ${sErr?.message ?? "inexistente"}`);
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", server.owner_id)
    .maybeSingle();
  if (pErr) console.warn("[TelegramAlert] Perfil opcional não encontrado", pErr.code);
  const serverView = { ...server, profiles: profile ?? null };

  const message = formatAlertMessage(serverView, data);
  // UNSTABLE não possui incidente offline (UUID). Deduplique por servidor,
  // destinatário e janela de 2h usando o log, sem inventar incident_id.
  const unstableWindow = event === "UNSTABLE" ? `_${Math.floor(Date.now() / (2 * 60 * 60_000))}` : "";
  const logEvent = `tg_${data.kind ?? "server"}_${event.toLowerCase()}${unstableWindow}`;
  const trackDelivery = !!incidentId || event === "UNSTABLE";

  // A entrega é idempotente POR CANAL, não por incidente inteiro.
  // Se um canal recebeu e outro falhou, somente o segundo é tentado novamente.
  const delivered = new Set<string>();
  let adminDelivered = false;
  let customerDelivered = false;
  if (trackDelivery) {
    let previousQuery = supabaseAdmin.from("notifications_log")
      .select("channel_id")
      .eq("event", logEvent).eq("ok", true);
    previousQuery = incidentId
      ? previousQuery.eq("incident_id", incidentId)
      : previousQuery.eq("server_id", serverId).is("incident_id", null);
    const { data: previous, error } = await previousQuery;
    if (error) throw new Error(`Falha ao consultar histórico de alertas: ${error.message}`);
    for (const item of previous ?? []) {
      if (item.channel_id) { delivered.add(item.channel_id); customerDelivered = true; }
      else adminDelivered = true;
    }
  }

  const { data: channels, error: channelsError } = await supabaseAdmin
    .from("alert_channels").select("id, target")
    .eq("owner_id", server.owner_id).eq("kind", "telegram").eq("enabled", true);
  if (channelsError) throw new Error(channelsError.message);

  for (const channel of channels ?? []) {
    if (delivered.has(channel.id)) continue;
    let ok = false;
    let response = "telegram_ok";
    try {
      await sendToTelegram(channel.target, message);
      ok = true;
      customerDelivered = true;
    } catch (error) {
      response = error instanceof Error ? error.message.slice(0, 120) : "telegram_failed";
      console.error("[TelegramAlert] Entrega pendente para nova tentativa", serverId, response);
    }
    if (trackDelivery) {
      const { error: logError } = await supabaseAdmin.from("notifications_log")
        .insert({ incident_id: incidentId ?? null, server_id: serverId, channel_id: channel.id,
          event: logEvent, ok, response });
      if (logError) throw new Error(`Falha ao registrar entrega Telegram: ${logError.message}`);
    }
  }

  if (incidentId && event === "OFFLINE" && customerDelivered) {
    const { error: stateError } = await supabaseAdmin.from("incidents")
      .update({ alert_sent: true }).eq("id", incidentId);
    if (stateError) console.error("[TelegramAlert] Não foi possível marcar entrega", stateError);
  }

  if (!data.suppressAdminCopy && !adminDelivered) {
    const ok = await notifyAdminAlert(serverView, data, message);
    if (trackDelivery) {
      const { error: logError } = await supabaseAdmin.from("notifications_log")
        .insert({ incident_id: incidentId ?? null, server_id: serverId, channel_id: null,
          event: logEvent, ok, response: ok ? "admin_ok" : "admin_failed" });
      if (logError) console.error("[TelegramAlert] Falha no log de entrega admin", logError);
    }
  }
}

function formatAlertMessage(server: any, data: AlertData): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR");
  
  const esc = (s: any) => String(s ?? "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

  if (data.kind === "dns") {
    if (data.event === "OFFLINE") {
      return (
        `🚨 <b>STREAM MONITOR — DNS OFFLINE CONFIRMADO</b>\n\n` +
        `<b>Domínio:</b> <code>${esc(server.host)}</code>\n` +
        `<b>Servidor:</b> ${esc(server.name)}\n` +
        `<b>Status DNS:</b> 🔴 Não resolve\n` +
        `<b>Confirmação:</b> falhas consecutivas em resolvedores independentes\n` +
        `<b>Fontes:</b> ${esc(data.regions?.join(", ") || "DNS externos")}\n` +
        `<b>Horário:</b> ${timeStr} (${dateStr})\n\n` +
        `O estado do DNS não determina, sozinho, que o servidor IPTV está offline.`
      );
    }
    if (data.event === "ONLINE") {
      return (
        `✅ <b>STREAM MONITOR — DNS RESTABELECIDO</b>\n\n` +
        `<b>Domínio:</b> <code>${esc(server.host)}</code>\n` +
        `<b>Servidor:</b> ${esc(server.name)}\n` +
        `<b>Tempo de falha:</b> ${esc(data.timeOffline || "N/A")}\n` +
        `<b>Horário:</b> ${timeStr} (${dateStr})`
      );
    }
  }

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

  if (data.event === "UNSTABLE") {
    return (
      `⚠️ <b>Stream Monitor - SERVIDOR INSTÁVEL</b>\n\n` +
      `<b>Servidor:</b> ${esc(server.name)}\n` +
      `<b>Status:</b> 🟠 OSCILANDO / COM FALHAS\n` +
      `<b>Motivo:</b> ${esc(data.reason)}\n` +
      `<b>Horário:</b> ${timeStr} (${dateStr})\n` +
      `<b>Host:</b> <code>${esc(server.host)}</code>`
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

  if (!botToken || !chatId) throw new Error("Canal Telegram sem token ou chat ID.");

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  } catch (e) {
    console.error("[TelegramAlert] Erro ao enviar para Telegram:", e);
    throw e;
  }
}

async function notifyAdminAlert(server: any, data: AlertData, userMessage: string) {
  const adminToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!adminToken || !adminChatId) return false;

  const adminMsg = `🛡 <b>ADMIN LOG - MONITOR</b>\n` +
    `Usuário: ${server.profiles?.email || "N/A"}\n` +
    `ID Servidor: <code>${server.id}</code>\n\n` +
    userMessage;

  try {
    const response = await fetch(`https://api.telegram.org/bot${adminToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: adminChatId, text: adminMsg, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch (error) {
    console.error("[TelegramAlert] Falha de envio ao administrador", error);
    return false;
  }
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
