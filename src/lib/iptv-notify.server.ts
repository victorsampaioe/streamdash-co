// Envio de alertas IPTV pelos canais do dono do servidor (Telegram/Discord/Webhook/Email).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "node:crypto";
import { formatIptvAlertMessage, type IptvNoticeItem } from "./iptv-telegram-format";

export type IptvAlertItem = IptvNoticeItem;

/** Compatibilidade: um único alerta. */
export async function notifyServerIptvAlert(serverId: string, title: string, detail: string) {
  return notifyServerIptvAlerts(serverId, [{ title, detail }]);
}

/** Envia UMA mensagem consolidada com todos os problemas detectados no servidor. */
export async function notifyServerIptvAlerts(serverId: string, items: IptvAlertItem[], deliveryKey?: string) {
  if (!items.length) return;
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, name, host, iptv_username, iptv_password").eq("id", serverId).maybeSingle();
  if (!server) return;

  const displayServer = {
    name: server.name, host: server.host,
    hasCredentials: Boolean(server.iptv_username && server.iptv_password),
  };
  const observedAt = new Date();
  // Admin receives the owner identity; reseller messages omit private email.
  // Both versions share the exact same clear, HTML-escaped alert details.
  const message = formatIptvAlertMessage(displayServer, items, { observedAt, mode: "html" });
  const plainMessage = formatIptvAlertMessage(displayServer, items, { observedAt, mode: "plain" });
  // Admin and reseller copies must use the SAME audited Telegram outbox.
  // The old direct notifyAdmin() return status was ignored, so a missing
  // ADMIN_TELEGRAM_CHAT_ID or a rejected Telegram response was invisible.
  let adminMessage = message;
  try {
    const { data: prof } = await supabaseAdmin.from("profiles")
      .select("full_name, email").eq("id", server.owner_id).maybeSingle();
    adminMessage = formatIptvAlertMessage(displayServer, items, {
      observedAt, mode: "html", admin: true,
      owner: { name: prof?.full_name, email: prof?.email },
    });
  } catch (error) {
    console.warn("[iptv-alert] failed to format admin alert",
      error instanceof Error ? error.name : "unknown");
  }

  const { data: channels, error: channelsError } = await supabaseAdmin
    .from("alert_channels").select("id,kind,target,owner_id")
    .eq("owner_id", server.owner_id).eq("enabled", true);
  if (channelsError) throw new Error("iptv_reseller_channels_unavailable");

  // Admin recipients are identified by the official roles table, not by a
  // hard-coded chat id. Each receives their own auditable delivery record.
  const { data: admins, error: adminRolesError } = await supabaseAdmin
    .from("user_roles").select("user_id").eq("role", "admin");
  if (adminRolesError) throw new Error("iptv_admin_roles_unavailable");
  const adminIds = [...new Set((admins ?? []).map(a => a.user_id))];
  const { data: adminChannels, error: adminChannelError } = adminIds.length
    ? await supabaseAdmin.from("alert_channels")
        .select("id,kind,target,owner_id")
        .in("owner_id", adminIds).eq("kind", "telegram").eq("enabled", true)
    : { data: [], error: null };
  if (adminChannelError) throw new Error("iptv_admin_channels_unavailable");

  const recipients = new Map<string, { id: string; kind: string; target: string; admin: boolean }>();
  for (const ch of channels ?? []) {
    if (ch.target) recipients.set(ch.id, { id: ch.id, kind: ch.kind, target: ch.target, admin: false });
  }
  for (const ch of adminChannels ?? []) {
    if (ch.target) recipients.set(ch.id, { id: ch.id, kind: ch.kind, target: ch.target, admin: true });
  }
  if (!recipients.size) return;

  // Only a verified Telegram API response may mark a message delivered.
  // Persisting the outbox before sending lets the Cloudflare Queue retry on
  // transport failures; a unique event+channel key prevents duplicate alerts.
  const eventFingerprint = createHash("sha256").update(
    deliveryKey ?? items.map(i => [i.kind ?? "", i.title, i.detail ?? ""].join("|")).sort().join("\\n")
  ).digest("hex");

  let telegramQueued = 0;
  const results = await Promise.allSettled([...recipients.values()].map(async ch => {
    if (ch.kind === "telegram") {
      const digest = createHash("sha256")
        .update(["iptv", serverId, ch.id, eventFingerprint].join(":")).digest("hex");
      const { error } = await supabaseAdmin.from("telegram_outbox" as any).upsert({
        idempotency_key: "iptv:" + digest,
        target: ch.target, text: ch.admin ? adminMessage : message,
        source: ch.admin ? "iptv_admin_alert" : "iptv_alert",
        status: "pending", attempts: 0, max_attempts: 7,
        next_attempt_at: new Date().toISOString(),
        server_id: serverId, channel_id: ch.id,
        alert_event: "iptv_" + (items[0]?.kind ?? "alert"),
      }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      if (error) throw new Error("iptv_telegram_queue_insert_failed");
      telegramQueued++;
    } else if (ch.kind === "discord") {
      const response = await fetch(ch.target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "StreamMonitor IPTV", content: plainMessage }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("iptv_discord_http_" + response.status);
    } else if (ch.kind === "webhook") {
      const response = await fetch(ch.target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "iptv_alert", server_id: serverId, items, at: new Date().toISOString() }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("iptv_webhook_http_" + response.status);
    }
  }));
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[iptv-alert] channel delivery enqueue failed",
        result.reason instanceof Error ? result.reason.message.slice(0, 100) : "unknown");
    }
  }
  if (telegramQueued) {
    // Fast lane: send immediately through the same atomic outbox claim used
    // by Cloudflare Queue. A second dispatcher cannot send the same row.
    const { processTelegramOutbox } = await import("./telegram-outbox.server");
    try {
      await processTelegramOutbox(5);
    } catch (error) {
      console.warn("[iptv-alert] immediate delivery deferred to queue",
        error instanceof Error ? error.message : "unknown");
    }
  }
  if (results.some(r => r.status === "rejected")) {
    throw new Error("iptv_alert_one_or_more_channels_failed");
  }
}

/** Notifica sobre novos conteúdos detectados no catálogo. */
export async function notifyNewContent(serverId: string, item: { kind: string; name: string; category: string | null }, opts: { isRare?: boolean, isFirst?: boolean } = {}) {
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, name").eq("id", serverId).maybeSingle();
  if (!server) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("telegram_iptv_style").eq("id", server.owner_id).maybeSingle();
  
  const style = profile?.telegram_iptv_style || 'summary';

  // Se for alerta importante (raro, primeira detecção ou explicitamente marcado), manda individual
  const isImportant = opts.isRare || opts.isFirst;

  if (style === 'individual' || (style === 'important' && isImportant)) {
    await sendIndividualNotification(server, item, opts);
  } else {
    // Caso contrário, enfileira para o resumo de 15 min
    await supabaseAdmin.from("iptv_notification_queue").insert({
      owner_id: server.owner_id,
      server_id: server.id,
      kind: item.kind,
      name: item.name,
      category: item.category,
      is_rare: opts.isRare || false,
      is_first_detection: opts.isFirst || false
    } as never);
  }
}

async function sendIndividualNotification(server: any, item: any, opts: any) {
  const { data: globalInfo } = await supabaseAdmin
    .from("tmdb_content_history")
    .select("servers_found_count")
    .eq("title_key", require("./iptv-catalog.server").titleKey(item.name))
    .maybeSingle();

  const icon = item.kind === "live" ? "📡" : (item.kind === "series" ? "📺" : (item.kind === "system" ? "🔥" : "🎬"));
  const kindLabel = item.kind === "live" ? "Canal" : (item.kind === "series" ? "Série" : (item.kind === "system" ? "Aviso" : "Filme"));
  
  const prefix = opts.isRare ? "🚨 <b>Conteúdo Raro</b>\n" : (opts.isFirst ? "🚨 <b>Primeira Detecção</b>\n" : "🚨 <b>Novo conteúdo detectado</b>\n");

  const message = `${prefix}\n` +
    `${icon} ${kindLabel}:\n<b>${item.name}</b>\n\n` +
    `🔥 Adicionado primeiro:\n${server.name}\n\n` +
    `📺 Encontrado em:\n${globalInfo?.servers_found_count || 1} servidores\n\n` +
    `Confira no painel: streammonitor.site/app/inteligencia`;

  // Notifica o admin
  try {
    const { notifyAdmin } = await import("./admin-telegram.server");
    await notifyAdmin(message);
  } catch { /* ignore */ }

  // Notifica os canais do usuário
  const { data: channels } = await supabaseAdmin
    .from("alert_channels").select("*").eq("owner_id", server.owner_id).eq("enabled", true).eq("kind", "telegram");
  
  if (channels?.length) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    for (const ch of channels) {
      let botToken = token ?? "";
      let chatId = ch.target?.trim() ?? "";
      if (chatId.includes(":")) { const [t, c] = chatId.split(":"); botToken = t; chatId = c; }
      if (!botToken || !chatId) continue;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      }).catch(() => {});
    }
  }
}

/** Processa a fila de notificações pendentes. Chamado via cron a cada 15 min. */
export async function flushIptvNotificationQueue() {
  const { data: pending } = await supabaseAdmin
    .from("iptv_notification_queue")
    .select("*, servers(name)")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(250);

  if (!pending?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const escapeHtml = (value: unknown) => String(value ?? "").replace(/[<>&]/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!);

  // Agrupa por owner_id
  const byOwner: Record<string, any[]> = {};
  for (const item of pending) {
    if (!byOwner[item.owner_id]) byOwner[item.owner_id] = [];
    byOwner[item.owner_id].push(item);
  }

  for (const [ownerId, items] of Object.entries(byOwner)) {
    const { data: channels } = await supabaseAdmin
      .from("alert_channels").select("*").eq("owner_id", ownerId).eq("enabled", true).eq("kind", "telegram");
    
    if (!channels?.length) { failed += items.length; continue; }

    const movies = items.filter(i => i.kind === 'vod');
    const series = items.filter(i => i.kind === 'series');
    const servers = Array.from(new Set(items.map(i => i.servers?.name))).filter(Boolean);
    
    let message = "";
    if (items.length > 50) {
      message = `🔥 <b>${items.length} novos conteúdos detectados</b>\n\n` +
        `Muitas novidades foram encontradas nos últimos 15 minutos.\n\n` +
        `Veja o relatório completo no painel.\n` +
        `streammonitor.site/app/inteligencia`;
    } else {
      message = `🔥 <b>Novos conteúdos detectados</b>\n\n` +
        `Foram encontrados ${items.length} novos conteúdos:\n\n`;
      
      if (movies.length > 0) {
        message += `🎬 <b>Filmes:</b>\n` + movies.slice(0, 10).map(m => `• ${escapeHtml(m.name)}`).join("\n") + "\n";
        if (movies.length > 10) message += `<i>... e mais ${movies.length - 10} filmes</i>\n`;
        message += "\n";
      }

      if (series.length > 0) {
        message += `📺 <b>Séries:</b>\n` + series.slice(0, 10).map(s => `• ${escapeHtml(s.name)}`).join("\n") + "\n";
        if (series.length > 10) message += `<i>... e mais ${series.length - 10} séries</i>\n`;
        message += "\n";
      }

      if (servers.length > 0) {
        message += `🏆 <b>Primeiros servidores a adicionar:</b>\n${servers.map(escapeHtml).join(", ")}\n\n`;
      }

      message += `⏰ <b>Período:</b>\nÚltimos 15 minutos`;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    let allDelivered = true;
    for (const ch of channels) {
      let botToken = token ?? "";
      let chatId = ch.target?.trim() ?? "";
      if (chatId.includes(":")) { const [t, target] = chatId.split(":"); botToken = t; chatId = target; }
      if (!botToken || !chatId) { allDelivered = false; continue; }
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          allDelivered = false;
          console.error("[IPTV notifications] Telegram recusou envio", response.status);
        }
      } catch (error) {
        allDelivered = false;
        console.error("[IPTV notifications] Falha na entrega", error);
      }
    }

    // Só remove da fila depois de confirmação de todos os canais habilitados.
    // Em entrega parcial pode ocorrer repetição no próximo ciclo (at-least-once).
    if (allDelivered) {
      const { error } = await supabaseAdmin.from("iptv_notification_queue")
        .update({ sent_at: new Date().toISOString() } as never)
        .in("id", items.map(i => i.id));
      if (error) throw new Error(`Não foi possível confirmar fila IPTV: ${error.message}`);
      sent += items.length;
    } else {
      failed += items.length;
    }
  }
  return { sent, failed };
}
