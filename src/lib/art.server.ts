// Server-only helpers do Gerador de Artes de Novidades.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function esc(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

async function send(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch { /* best-effort */ }
}

/** Avisa o dono do servidor (canais Telegram dele) + o admin que há nova arte. */
export async function notifyNewArt(serverId: string, serverName: string, total: number) {
  const message =
    `🎨 <b>Nova arte disponível!</b>\n\n` +
    `Seu servidor <b>${esc(serverName)}</b> possui uma nova arte de novidades pronta` +
    (total > 0 ? ` com <b>${total}</b> conteúdos novos` : "") + `.\n\n` +
    `Acesse o painel para visualizar e baixar:\n👉 https://streammonitor.site/app/artes`;

  const { data: server } = await supabaseAdmin
    .from("servers").select("owner_id").eq("id", serverId).maybeSingle();

  if (server?.owner_id) {
    const { data: channels } = await supabaseAdmin
      .from("alert_channels")
      .select("target")
      .eq("owner_id", server.owner_id)
      .eq("kind", "telegram")
      .eq("enabled", true);
    for (const ch of channels ?? []) {
      const raw = String(ch.target ?? "").trim();
      const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0]! : raw;
      await send(chatId, message);
    }
  }

  const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (adminChat) await send(adminChat, message);
  return { ok: true };
}
