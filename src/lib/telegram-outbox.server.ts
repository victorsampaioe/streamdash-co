import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isPermanentTelegramError, nextBackoffSeconds, outboxKey } from "./telegram-outbox";

export class TelegramSendError extends Error {
  constructor(public status: number, public retryAfter: number | null, msg: string) { super(msg); }
}

function resolveTarget(target: string) {
  let token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  let chat = target.trim();
  if (chat.includes(":")) { const [t, c] = chat.split(":"); token = t; chat = c; }
  return { token, chat };
}

export async function rawTelegramSend(target: string, text: string) {
  const { token, chat } = resolveTarget(target);
  if (!token || !chat) throw new TelegramSendError(400, null, "Canal Telegram sem token ou chat ID.");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    let retryAfter: number | null = null;
    let desc = "";
    try { const j: any = await r.json(); retryAfter = j?.parameters?.retry_after ?? null; desc = String(j?.description ?? "").slice(0, 200); } catch {}
    throw new TelegramSendError(r.status, retryAfter, `Telegram HTTP ${r.status} ${desc}`.trim());
  }
}

/** Guarda uma falha transitória para reenvio durável. Idempotente por destino+texto. */
export async function enqueueTelegramRetry(target: string, text: string, err: unknown, source = "alert") {
  const status = err instanceof TelegramSendError ? err.status : 0;
  const retryAfter = err instanceof TelegramSendError ? err.retryAfter : null;
  const key = await outboxKey(target, text);
  const dead = isPermanentTelegramError(status);
  const { error } = await supabaseAdmin.from("telegram_outbox").upsert({
    idempotency_key: key, target, text, source,
    status: dead ? "dead" : "pending",
    attempts: 1,
    last_error: String((err as any)?.message ?? err).slice(0, 300),
    next_attempt_at: new Date(Date.now() + nextBackoffSeconds(1, retryAfter) * 1000).toISOString(),
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao gravar fila Telegram: ${error.message}`);
  return { queued: !dead };
}

/** Worker: processa itens vencidos. Máx ~1 msg/s para respeitar limites do Telegram. */
export async function processTelegramOutbox(limit = 20) {
  const { data: rows, error } = await supabaseAdmin.from("telegram_outbox")
    .select("id, target, text, attempts, max_attempts")
    .eq("status", "pending").lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at").limit(limit);
  if (error) throw new Error(error.message);
  let sent = 0, failed = 0, dead = 0;
  for (const row of rows ?? []) {
    // Reserva otimista: só um worker avança a mesma tentativa.
    const { data: claimed } = await supabaseAdmin.from("telegram_outbox")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    const attempts = row.attempts + 1;
    try {
      await rawTelegramSend(row.target, row.text);
      await supabaseAdmin.from("telegram_outbox").update({ status: "sent", attempts, delivered_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
      sent++;
    } catch (e) {
      const st = e instanceof TelegramSendError ? e.status : 0;
      const isDead = isPermanentTelegramError(st) || attempts >= row.max_attempts;
      await supabaseAdmin.from("telegram_outbox").update({
        status: isDead ? "dead" : "pending", attempts,
        last_error: String((e as any)?.message ?? e).slice(0, 300),
        next_attempt_at: new Date(Date.now() + nextBackoffSeconds(attempts, e instanceof TelegramSendError ? e.retryAfter : null) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      isDead ? dead++ : failed++;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Itens presos em "sending" por queda do worker voltam para a fila após 5 min.
  await supabaseAdmin.from("telegram_outbox").update({ status: "pending" })
    .eq("status", "sending").lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString());
  return { picked: rows?.length ?? 0, sent, failed, dead };
}
