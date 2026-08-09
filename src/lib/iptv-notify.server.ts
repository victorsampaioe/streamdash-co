// Envio de alertas IPTV pelos canais do dono do servidor (Telegram/Discord/Webhook/Email).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type IptvAlertItem = { title: string; detail?: string; severity?: string };

/** Compatibilidade: um único alerta. */
export async function notifyServerIptvAlert(serverId: string, title: string, detail: string) {
  return notifyServerIptvAlerts(serverId, [{ title, detail }]);
}

/** Envia UMA mensagem consolidada com todos os problemas detectados no servidor. */
export async function notifyServerIptvAlerts(serverId: string, items: IptvAlertItem[]) {
  if (!items.length) return;
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, name, host, iptv_username, iptv_password").eq("id", serverId).maybeSingle();
  if (!server) return;

  const esc = (s: unknown) =>
    String(s ?? "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

  const plainLines = items.map((i) => `• ${i.title}${i.detail ? ` — ${i.detail}` : ""}`);
  const htmlLines = items.map((i) => `• <b>${esc(i.title)}</b>${i.detail ? ` — ${esc(i.detail)}` : ""}`);
  const header = items.length > 1
    ? `📡 ${items.length} problemas detectados`
    : "📡 Alerta do servidor";

  // Cópia sempre para o Telegram do admin
  try {
    const { notifyAdmin } = await import("./admin-telegram.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("full_name, email").eq("id", server.owner_id).maybeSingle();
    await notifyAdmin(
      `📡 <b>${esc(header)}</b>\n${esc(server.name)}\n${htmlLines.join("\n")}\n` +
        `Revenda: ${esc(prof?.full_name)} — ${esc(prof?.email)}\n` +
        `Host: <code>${esc(server.host)}</code>` +
        (server.iptv_username && server.iptv_password ? "\nIPTV: credenciais ativas ✅" : ""),
    );
  } catch { /* ignore */ }

  const { data: channels } = await supabaseAdmin
    .from("alert_channels").select("*").eq("owner_id", server.owner_id).eq("enabled", true);
  if (!channels?.length) return;

  const message = `${header}\n${server.name}\n${plainLines.join("\n")}`;

  await Promise.allSettled(channels.map(async (ch: { id: string; kind: string; target: string }) => {
    try {
      if (ch.kind === "telegram") {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        let botToken = token ?? "";
        let chatId = ch.target?.trim() ?? "";
        if (chatId.includes(":")) { const [t, c] = chatId.split(":"); botToken = t; chatId = c; }
        if (!botToken || !chatId) return;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message }),
        });
      } else if (ch.kind === "discord") {
        await fetch(ch.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "StreamMonitor IPTV", content: message }),
        });
      } else if (ch.kind === "webhook") {
        await fetch(ch.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "iptv_alert", server_id: serverId, items, at: new Date().toISOString(),
          }),
        });
      }
    } catch { /* best-effort */ }
  }));
}

/** Notifica sobre novos conteúdos detectados no catálogo. */
export async function notifyNewContent(serverId: string, item: { kind: string; name: string; category: string | null }) {
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, name").eq("id", serverId).maybeSingle();
  if (!server) return;

  const { data: globalInfo } = await supabaseAdmin
    .from("tmdb_content_history")
    .select("servers_found_count")
    .eq("title_key", require("./iptv-catalog.server").titleKey(item.name))
    .maybeSingle();

  const icon = item.kind === "live" ? "📡" : (item.kind === "series" ? "📺" : "🎬");
  const kindLabel = item.kind === "live" ? "Canal" : (item.kind === "series" ? "Série" : "Filme");

  const message = `🚨 <b>Novo conteúdo detectado</b>\n\n` +
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
