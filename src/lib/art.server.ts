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

/** Envia uma mensagem para os canais Telegram do dono do servidor + admin. */
async function notifyOwner(ownerId: string | null | undefined, message: string) {
  if (ownerId) {
    const { data: channels } = await supabaseAdmin
      .from("alert_channels")
      .select("target")
      .eq("owner_id", ownerId)
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

  await notifyOwner(server?.owner_id, message);
  return { ok: true };
}

const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // no máximo 1 arte automática a cada 6h por servidor
const MAX_LIST = 20;

/**
 * Gera automaticamente uma arte de novidades quando o monitoramento detecta
 * conteúdos novos naquele servidor. Salva o histórico e avisa no Telegram.
 * Nunca mistura conteúdos entre servidores.
 */
export async function autoGenerateArt(serverId: string) {
  const { data: server } = await supabaseAdmin
    .from("servers").select("id, name, owner_id").eq("id", serverId).maybeSingle();
  if (!server) return { ok: false as const, reason: "server_not_found" };

  const { data: last } = await supabaseAdmin
    .from("art_generations")
    .select("created_at")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
  if (lastAt && now - lastAt < MIN_INTERVAL_MS) return { ok: false as const, reason: "cooldown" };

  const since = new Date(Math.max(lastAt, now - 24 * 3600 * 1000)).toISOString();

  const { data: changes } = await supabaseAdmin
    .from("iptv_catalog_changes")
    .select("name, kind, detected_at")
    .eq("server_id", serverId)
    .eq("action", "added")
    .gte("detected_at", since)
    .order("detected_at", { ascending: false })
    .limit(400);

  const rows = changes ?? [];
  if (rows.length === 0) return { ok: false as const, reason: "no_news" };

  const pick = (k: string) => rows.filter((c) => c.kind === k).map((c) => c.name).slice(0, MAX_LIST);
  const movies = pick("vod");
  const series = pick("series");
  const channels = pick("live");

  const periodHours = Math.max(1, Math.round((now - new Date(since).getTime()) / 3600_000));

  const { error } = await supabaseAdmin.from("art_generations").insert({
    server_id: serverId,
    created_by: server.owner_id,
    server_name: server.name,
    total_new: rows.length,
    movies,
    series,
    channels,
    period_hours: periodHours,
  });
  if (error) return { ok: false as const, reason: error.message };

  const nMovies = rows.filter((c) => c.kind === "vod").length;
  const nSeries = rows.filter((c) => c.kind === "series").length;
  const nLive = rows.filter((c) => c.kind === "live").length;

  const message =
    `🎨 <b>NOVA ARTE DISPONÍVEL!</b>\n\n` +
    `O servidor <b>${esc(server.name)}</b> recebeu novas atualizações.\n\n` +
    `🔥 <b>Novidades detectadas:</b>\n` +
    `🎬 Filmes: +${nMovies}\n` +
    `📺 Séries: +${nSeries}\n` +
    `📡 Canais: +${nLive}\n\n` +
    `Sua arte de divulgação já está pronta.\n` +
    `Acesse o Stream Monitor para visualizar e compartilhar. 🚀\n` +
    `👉 https://streammonitor.site/app/artes`;

  await notifyOwner(server.owner_id, message);

  return { ok: true as const, total: rows.length, movies: nMovies, series: nSeries, channels: nLive };
}
