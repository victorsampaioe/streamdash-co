// Server-only helper to notify the admin via Telegram (single chat).
// Do NOT import this file from client bundles.

export async function notifyAdmin(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: "TELEGRAM_BOT_TOKEN/ADMIN_TELEGRAM_CHAT_ID ausente" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "erro" };
  }
}

export async function notifyNewlyExpiredSubscriptions(): Promise<{ notified: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: expired, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, plan, expires_at")
    .lt("expires_at", new Date().toISOString())
    .in("status", ["trial", "active"]);
  if (error || !expired?.length) return { notified: 0 };

  let count = 0;
  for (const sub of expired) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", sub.user_id)
      .maybeSingle();
    const label = sub.plan === "trial" ? "Teste gratuito" : `Assinatura ${sub.plan}`;
    await notifyAdmin(
      `⏰ <b>Assinatura expirada</b>\n${label}\n${escape(prof?.full_name ?? "-")} — ${escape(prof?.email ?? "-")}\nVenceu em: ${new Date(sub.expires_at).toLocaleString("pt-BR")}`
    );
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("user_id", sub.user_id)
      .in("status", ["trial", "active"]);
    count++;
  }
  return { notified: count };
}

function escape(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}
