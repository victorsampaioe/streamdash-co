// Envio de alertas IPTV pelos canais do dono do servidor (Telegram/Discord/Webhook/Email).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function notifyServerIptvAlert(serverId: string, title: string, detail: string) {
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, owner_id, name").eq("id", serverId).maybeSingle();
  if (!server) return;

  const { data: channels } = await supabaseAdmin
    .from("alert_channels").select("*").eq("owner_id", server.owner_id).eq("enabled", true);
  if (!channels?.length) return;

  const message = `${title}\n${server.name}${detail ? `\n${detail}` : ""}`;

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
          body: JSON.stringify({ type: "iptv_alert", server_id: serverId, title, detail, at: new Date().toISOString() }),
        });
      }
    } catch { /* best-effort */ }
  }));
}
