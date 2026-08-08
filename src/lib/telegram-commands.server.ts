// Comandos interativos do bot @MonitordeFluxoBot.
// Resolve o revendedor pelo chat_id cadastrado em alert_channels e responde na hora.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PANEL = "https://streammonitor.site/app";

export function esc(s: unknown) {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

const DOT: Record<string, string> = { up: "🟢", degraded: "🟡", down: "🔴", unknown: "⚪" };

export async function resolveUserByChatId(chatId: string | number): Promise<string | null> {
  const id = String(chatId);
  const { data } = await supabaseAdmin
    .from("alert_channels")
    .select("owner_id, target, enabled")
    .eq("kind", "telegram")
    .eq("enabled", true);
  for (const c of data ?? []) {
    const raw = String(c.target ?? "").trim();
    const cid = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    if (cid === id) return c.owner_id;
  }
  return null;
}

async function myServers(userId: string) {
  const { data } = await supabaseAdmin
    .from("servers")
    .select("id, name, current_status, last_latency_ms, health_score, dns_health_score, ssl_days_remaining, last_checked_at")
    .eq("owner_id", userId)
    .order("name");
  return data ?? [];
}

function noServers() {
  return `Você ainda não tem servidores cadastrados.\n\nCadastre em ${PANEL}/servers/new`;
}

export const COMMAND_HELP =
  `🤖 <b>Comandos disponíveis</b>\n\n` +
  `/status — status de todos os seus servidores\n` +
  `/offline — apenas os que estão fora do ar ou instáveis\n` +
  `/health — saúde (health score) de cada servidor\n` +
  `/novidades — o que entrou no catálogo nas últimas 24h\n` +
  `/filmes — últimos filmes adicionados\n` +
  `/series — últimas séries adicionadas\n` +
  `/canais — últimos canais adicionados\n` +
  `/ranking — sua posição no ranking IPTV\n` +
  `/resumo — enviar agora o relatório inteligente completo\n` +
  `/id — mostrar seu código de vinculação\n` +
  `/ajuda — esta lista`;

async function cmdStatus(userId: string) {
  const servers = await myServers(userId);
  if (!servers.length) return noServers();
  const up = servers.filter((s) => s.current_status === "up").length;
  const deg = servers.filter((s) => s.current_status === "degraded").length;
  const down = servers.filter((s) => s.current_status === "down").length;
  const lines = servers.map((s) => {
    const lat = s.last_latency_ms != null ? ` · ${s.last_latency_ms}ms` : "";
    return `${DOT[s.current_status] ?? "⚪"} <b>${esc(s.name)}</b>${lat}`;
  });
  return (
    `📡 <b>Status dos seus servidores</b>\n\n` +
    `🟢 ${up} online · 🟡 ${deg} atenção · 🔴 ${down} offline\n\n` +
    lines.join("\n")
  );
}

async function cmdOffline(userId: string) {
  const servers = await myServers(userId);
  if (!servers.length) return noServers();
  const bad = servers.filter((s) => s.current_status === "down" || s.current_status === "degraded");
  if (!bad.length) return `✅ <b>Tudo certo!</b>\n\nNenhum servidor offline ou instável agora.`;
  const lines = bad.map((s) => {
    const when = s.last_checked_at ? new Date(s.last_checked_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
    return `${DOT[s.current_status]} <b>${esc(s.name)}</b>\n   última verificação: ${when}`;
  });
  return `🚨 <b>Servidores com problema (${bad.length})</b>\n\n${lines.join("\n")}`;
}

async function cmdHealth(userId: string) {
  const servers = await myServers(userId);
  if (!servers.length) return noServers();
  const rows = servers.map((s) => ({
    name: s.name as string,
    score: (s.health_score ?? s.dns_health_score) as number | null,
    ssl: s.ssl_days_remaining as number | null,
  }));
  const scored = rows.filter((r) => typeof r.score === "number");
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.score as number), 0) / scored.length) : null;
  const bar = (n: number) => "█".repeat(Math.round(n / 10)) + "░".repeat(10 - Math.round(n / 10));
  const lines = rows
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map((r) => {
      const s = r.score;
      const ssl = r.ssl != null ? ` · SSL ${r.ssl}d` : "";
      return s == null
        ? `⚪ <b>${esc(r.name)}</b> — sem dados${ssl}`
        : `${s >= 80 ? "🟢" : s >= 50 ? "🟡" : "🔴"} <b>${esc(r.name)}</b> — ${s}/100 ${bar(s)}${ssl}`;
    });
  return `💚 <b>Saúde dos servidores</b>${avg != null ? `\nMédia geral: <b>${avg}/100</b>` : ""}\n\n${lines.join("\n")}`;
}

async function changes(userId: string, hours: number, kind?: "vod" | "series" | "live") {
  const servers = await myServers(userId);
  if (!servers.length) return null;
  const ids = servers.map((s) => s.id);
  const nameOf = new Map(servers.map((s) => [s.id, s.name as string]));
  let q = supabaseAdmin
    .from("iptv_catalog_changes")
    .select("server_id, kind, name, detected_at")
    .in("server_id", ids)
    .eq("action", "added")
    .gte("detected_at", new Date(Date.now() - hours * 3600_000).toISOString())
    .order("detected_at", { ascending: false })
    .limit(500);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return { rows: data ?? [], nameOf };
}

async function cmdNovidades(userId: string) {
  const c = await changes(userId, 24);
  if (!c) return noServers();
  if (!c.rows.length) return `🎬 <b>Novidades (24h)</b>\n\nNenhuma novidade detectada nas últimas 24 horas.`;
  const count = (k: string) => c.rows.filter((r) => r.kind === k).length;
  const per = new Map<string, number>();
  for (const r of c.rows) per.set(r.server_id, (per.get(r.server_id) ?? 0) + 1);
  const top = Array.from(per.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    `🎬 <b>Novidades nas últimas 24h</b>\n\n` +
    `🎬 Filmes: <b>${count("vod")}</b>\n📺 Séries: <b>${count("series")}</b>\n📡 Canais: <b>${count("live")}</b>\n` +
    `Total: <b>${c.rows.length}</b>\n\n` +
    `<b>Por servidor</b>\n` +
    top.map(([sid, n]) => `• ${esc(c.nameOf.get(sid) ?? "—")}: ${n}`).join("\n") +
    `\n\nUse /filmes, /series ou /canais para ver os títulos.`
  );
}

async function cmdKind(userId: string, kind: "vod" | "series" | "live") {
  const label = kind === "vod" ? "🎬 Filmes" : kind === "series" ? "📺 Séries" : "📡 Canais";
  const c = await changes(userId, 48, kind);
  if (!c) return noServers();
  if (!c.rows.length) return `${label}\n\nNenhuma adição nas últimas 48h.`;
  const lines = c.rows.slice(0, 30).map((r) => `• ${esc(r.name)} <i>(${esc(c.nameOf.get(r.server_id) ?? "—")})</i>`);
  const extra = c.rows.length > 30 ? `\n\n…e mais ${c.rows.length - 30}.` : "";
  return `${label} <b>adicionados (48h)</b> — ${c.rows.length}\n\n${lines.join("\n")}${extra}`;
}

async function cmdRanking(userId: string) {
  const servers = await myServers(userId);
  if (!servers.length) return noServers();
  const mine = new Set(servers.map((s) => s.id));

  const { data: syncs } = await supabaseAdmin
    .from("iptv_syncs")
    .select("server_id, health_score, channels, movies, series, synced_at, login_ok, json_valid, error")
    .gte("synced_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("synced_at", { ascending: false })
    .limit(4000);

  const latest = new Map<string, any>();
  for (const s of syncs ?? []) if (!latest.has(s.server_id)) latest.set(s.server_id, s);
  const board = Array.from(latest.values())
    .filter((s) => s.login_ok && s.json_valid && !s.error && s.health_score != null)
    .sort((a, b) => (b.health_score - a.health_score) || ((b.channels ?? 0) - (a.channels ?? 0)));

  if (!board.length) return `🏆 <b>Ranking IPTV</b>\n\nAinda não há dados suficientes para montar o ranking.`;

  const { data: names } = await supabaseAdmin
    .from("servers")
    .select("id, name")
    .in("id", board.map((b) => b.server_id));
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name as string]));

  const total = board.length;
  const lines: string[] = [];
  board.forEach((b, i) => {
    if (!mine.has(b.server_id)) return;
    lines.push(
      `#${i + 1} de ${total} — <b>${esc(nameOf.get(b.server_id) ?? "—")}</b>\n` +
        `   saúde ${b.health_score}/100 · ${b.channels ?? 0} canais · ${b.movies ?? 0} filmes · ${b.series ?? 0} séries`,
    );
  });
  if (!lines.length) return `🏆 <b>Ranking IPTV</b>\n\nSeus servidores ainda não entraram no ranking (é preciso uma sincronização IPTV válida nas últimas 48h).`;
  return `🏆 <b>Sua posição no Ranking IPTV</b>\n\n${lines.join("\n\n")}`;
}

/** Processa um comando textual. Retorna a resposta em HTML, ou null se não for comando conhecido. */
export async function handleTelegramCommand(
  chatId: string | number,
  rawText: string,
): Promise<string | null> {
  const cmd = rawText.trim().toLowerCase().split(/[\s@]/)[0];
  if (!cmd?.startsWith("/")) return null;

  if (cmd === "/id") return `Seu código de vinculação é:\n\n<code>${chatId}</code>`;
  if (cmd === "/ajuda" || cmd === "/help" || cmd === "/comandos") return COMMAND_HELP;

  const known = ["/status", "/offline", "/health", "/saude", "/novidades", "/filmes", "/series", "/canais", "/ranking", "/resumo"];
  if (!known.includes(cmd)) return null;

  const userId = await resolveUserByChatId(chatId);
  if (!userId) {
    return (
      `🔒 <b>Telegram não vinculado</b>\n\n` +
      `Cadastre o código abaixo em ${PANEL}/alerts para usar os comandos:\n\n<code>${chatId}</code>`
    );
  }

  switch (cmd) {
    case "/status": return await cmdStatus(userId);
    case "/offline": return await cmdOffline(userId);
    case "/health":
    case "/saude": return await cmdHealth(userId);
    case "/novidades": return await cmdNovidades(userId);
    case "/filmes": return await cmdKind(userId, "vod");
    case "/series": return await cmdKind(userId, "series");
    case "/canais": return await cmdKind(userId, "live");
    case "/ranking": return await cmdRanking(userId);
    case "/resumo": {
      const { sendDigestToUser } = await import("./digest.server");
      const r = await sendDigestToUser(userId, "daily", true);
      return r.ok ? "📲 Resumo enviado!" : `Não foi possível enviar o resumo: ${esc(r.reason ?? "erro")}`;
    }
    default: return null;
  }
}
