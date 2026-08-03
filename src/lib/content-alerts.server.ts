// Alertas de conteúdo no Telegram — resumo agregado + eventos importantes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STATUS_LABEL, type ContentStatus } from "./content-monitor.server";

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  return res.ok;
}

async function ownerChatIds(ownerId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .eq("owner_id", ownerId)
    .eq("kind", "telegram")
    .eq("enabled", true);
  return (data ?? [])
    .map((c) => (c.target ?? "").trim())
    .map((t) => (t.includes(":") ? t.split(":")[1] : t))
    .filter(Boolean);
}

type Event = { row: any; status: ContentStatus; probe: any };

export async function notifyContentEvents(
  server: { id: string; owner_id: string; name: string },
  events: Event[],
  stats: { tested: number; failed: number; recovered: number; generalFailure: boolean },
) {
  const { data: settings } = await supabaseAdmin
    .from("content_alert_settings")
    .select("*")
    .eq("user_id", server.owner_id)
    .or(`server_id.eq.${server.id},server_id.is.null`)
    .order("server_id", { nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const cfg = {
    notify_movies: settings?.notify_movies ?? true,
    notify_series: settings?.notify_series ?? true,
    notify_channels: settings?.notify_channels ?? true,
    notify_recovery: settings?.notify_recovery ?? true,
    notify_only_favorites: settings?.notify_only_favorites ?? false,
    minimum_failures: settings?.minimum_failures ?? 3,
    telegram_enabled: settings?.telegram_enabled ?? true,
  };
  if (!cfg.telegram_enabled) return;

  const chats = await ownerChatIds(server.owner_id);
  if (!chats.length) return;

  if (stats.generalFailure) {
    const msg =
      `🚨 <b>Possível falha geral do servidor</b>\n\n` +
      `Servidor: <b>${server.name}</b>\n` +
      `Conteúdos testados: ${stats.tested}\n` +
      `Falhas: ${stats.failed} (${Math.round((stats.failed / Math.max(stats.tested, 1)) * 100)}%)\n\n` +
      `Verifique DNS, credenciais ou disponibilidade da Player API. Os testes foram reduzidos temporariamente.`;
    for (const c of chats) await sendTelegram(c, msg);
    return;
  }

  const kindAllowed = (t: string) =>
    (t === "movie" && cfg.notify_movies) ||
    ((t === "series" || t === "episode") && cfg.notify_series) ||
    (t === "live" && cfg.notify_channels);

  const relevant = events.filter((e) => kindAllowed(e.row.content_type))
    .filter((e) => (cfg.notify_only_favorites ? e.row.is_favorite : true));

  const down = relevant.filter((e) => ["offline", "blocked", "removed"].includes(e.status));
  const up = cfg.notify_recovery
    ? relevant.filter((e) => ["online", "slow"].includes(e.status) &&
        ["offline", "blocked", "unstable"].includes(e.row.current_status))
    : [];

  // Alertas individuais só para poucos eventos importantes / favoritos.
  const individual = [...down, ...up].filter((e) => e.row.is_favorite);
  if (individual.length && individual.length <= 5) {
    for (const e of individual) {
      const isDown = ["offline", "blocked", "removed"].includes(e.status);
      const msg = isDown
        ? `🚨 <b>Conteúdo offline detectado</b>\n\nServidor: <b>${server.name}</b>\n` +
          `${e.row.name}\nStatus: ${STATUS_LABEL[e.status]}\n` +
          `Erro: ${e.probe?.error_message ?? `HTTP ${e.probe?.http_status ?? "-"}`}\n` +
          `Falhas consecutivas: ${cfg.minimum_failures}\n` +
          `Última vez online: ${e.row.last_online_at ? new Date(e.row.last_online_at).toLocaleString("pt-BR") : "—"}`
        : `✅ <b>Conteúdo normalizado</b>\n\nServidor: <b>${server.name}</b>\n${e.row.name}\n` +
          `Status atual: ${STATUS_LABEL[e.status]}`;
      for (const c of chats) await sendTelegram(c, msg);
    }
    return;
  }

  if (!down.length && !up.length) return;

  const byStatus = (s: ContentStatus) => relevant.filter((e) => e.status === s).length;
  const summary =
    `📊 <b>Resumo de conteúdos</b>\n\nServidor: <b>${server.name}</b>\n\n` +
    `🔴 ${byStatus("offline")} offline\n` +
    `🟠 ${byStatus("unstable")} instáveis\n` +
    `🟡 ${byStatus("slow")} lentos\n` +
    `🔒 ${byStatus("blocked")} bloqueados\n` +
    `⚫ ${byStatus("removed")} removidos\n` +
    `✅ ${up.length} recuperados`;
  for (const c of chats) await sendTelegram(c, summary);
}
