import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function broadcastToTelegramSubscribers(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  const { data: channels, error } = await supabaseAdmin
    .from("alert_channels")
    .select("id, owner_id, target, enabled")
    .eq("kind", "telegram")
    .eq("enabled", true);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  await Promise.allSettled((channels ?? []).map(async (ch: any) => {
    let chatId = (ch.target ?? "").trim();
    let botToken = token;
    if (chatId.includes(":")) {
      const [t, c] = chatId.split(":");
      botToken = t; chatId = c;
    }
    if (!chatId) { failed++; return; }
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      });
      if (r.ok) sent++; else { failed++; errors.push(`${chatId}: HTTP ${r.status}`); }
    } catch (e: any) {
      failed++;
      errors.push(`${chatId}: ${e?.message ?? "erro"}`);
    }
  }));

  return { total: channels?.length ?? 0, sent, failed, errors: errors.slice(0, 10) };
}
