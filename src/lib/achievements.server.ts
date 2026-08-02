// Notificações de conquistas no Telegram.
// O usuário que desbloqueou recebe o aviso nos canais Telegram dele + cópia para o admin.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function send(chatId: string, text: string) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch {
    /* ignora falhas de notificação */
  }
}

/** Avisa o usuário (e o admin) quando novas conquistas são desbloqueadas. */
export async function notifyAchievements(userId: string, granted: number) {
  const adminChat = process.env["ADMIN_TELEGRAM_CHAT_ID"];
  if (granted <= 0) return;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: latest } = await supabaseAdmin
    .from("user_achievements")
    .select("achievement_code, unlocked_at")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false })
    .limit(granted);

  const codes = (latest ?? []).map((a) => a.achievement_code);
  const { data: meta } = await supabaseAdmin
    .from("achievements")
    .select("code, emoji, title, description")
    .in("code", codes.length ? codes : ["__none__"]);

  const list = (meta ?? []).map((m) => `${m.emoji} <b>${m.title}</b>`).join("\n") || `${granted} nova(s)`;
  const detailed =
    (meta ?? []).map((m) => `${m.emoji} <b>${m.title}</b>\n<i>${m.description}</i>`).join("\n\n") || list;

  // Canais Telegram do próprio usuário
  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .eq("owner_id", userId)
    .eq("kind", "telegram")
    .eq("enabled", true);

  const targets = Array.from(new Set((channels ?? []).map((c) => c.target).filter(Boolean)));
  await Promise.all(
    targets.map((chatId) =>
      send(
        String(chatId),
        `🏆 <b>Parabéns! Você desbloqueou uma conquista</b>\n\n${detailed}\n\nAcesse o painel para ver todas: streammonitor.site`,
      ),
    ),
  );

  if (adminChat) {
    await send(
      adminChat,
      `🏆 <b>Nova conquista desbloqueada</b>\n\n👤 ${profile?.full_name ?? profile?.email ?? userId}\n${profile?.email ? `✉️ ${profile.email}\n` : ""}\n${list}`,
    );
  }
}
