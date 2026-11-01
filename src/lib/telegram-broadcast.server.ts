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

  const { runPool } = await import("./pool");
  // Limite de vazão por bot para evitar bloqueio do Telegram (429).
  // Não dispara centenas de solicitações simultâneas.
  await runPool(channels ?? [], async (ch: any) => {
    let chatId = String(ch.target ?? "").trim();
    let botToken = token;
    if (chatId.includes(":")) {
      const [overrideToken, overrideChat] = chatId.split(":");
      botToken = overrideToken; chatId = overrideChat;
    }
    if (!chatId || !botToken) { failed++; return; }
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) sent++;
      else {
        failed++;
        errors.push(`Canal não entregue: HTTP ${r.status}`);
      }
    } catch (error) {
      failed++;
      errors.push(error instanceof Error ? error.message : "Falha no Telegram");
    }
  }, { concurrency: 3, jitterMs: 350 });

  return { total: channels?.length ?? 0, sent, failed, errors: errors.slice(0, 10) };
}
