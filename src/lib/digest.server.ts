// Resumo inteligente por revenda no Telegram (diário 08:00 / noturno 20:00).
// Envia apenas o que mudou desde o último resumo daquele usuário.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PANEL = "https://streammonitor.site/app";

export type DigestKind = "daily" | "night" | "weekly";

function esc(s: unknown) {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

async function sendTelegram(chatId: string, text: string, withButtons = true) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(withButtons
          ? {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🔎 Abrir Painel", url: PANEL }],
                  [
                    { text: "📊 Ver Relatório", url: `${PANEL}/servers` },
                    { text: "🎬 Ver Novidades", url: `${PANEL}/novidades` },
                  ],
                ],
              },
            }
          : {}),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function chatIdsFrom(rows: { target: string | null }[]) {
  const ids: string[] = [];
  for (const r of rows) {
    const raw = String(r.target ?? "").trim();
    const id = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    if (id) ids.push(id);
  }
  return Array.from(new Set(ids));
}

const KIND_LABEL: Record<string, { plural: string; singular: string; emoji: string }> = {
  vod: { plural: "filmes", singular: "filme", emoji: "🎬" },
  series: { plural: "séries", singular: "série", emoji: "📺" },
  live: { plural: "canais", singular: "canal", emoji: "📡" },
};

function fmtCount(kind: string, n: number) {
  const l = KIND_LABEL[kind];
  if (!l) return `${n} itens`;
  return `${n} ${n === 1 ? l.singular : l.plural}`;
}

function durationHuman(seconds: number) {
  if (seconds <= 0) return "0min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
}

type Built = {
  message: string;
  commercial: string | null;
  hadNews: boolean;
  summary: Record<string, unknown>;
};

export async function buildDigestForUser(userId: string, since: Date): Promise<Built | null> {
  const sinceIso = since.toISOString();

  const { data: prof } = await supabaseAdmin
    .from("profiles").select("full_name, email").eq("id", userId).maybeSingle();

  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select("id, name, current_status, health_score, ssl_days_remaining, last_checked_at")
    .eq("owner_id", userId);
  if (!servers?.length) return null;

  const ids = servers.map((s) => s.id);
  const nameOf = new Map(servers.map((s) => [s.id, s.name as string]));

  const online = servers.filter((s) => s.current_status === "up").length;
  const warn = servers.filter((s) => s.current_status === "degraded").length;
  const offline = servers.filter((s) => s.current_status === "down").length;

  const scored = servers.filter((s) => typeof s.health_score === "number");
  const avgHealth = scored.length
    ? Math.round(scored.reduce((a, s) => a + (s.health_score as number), 0) / scored.length)
    : null;
  const best = scored.slice().sort((a, b) => (b.health_score as number) - (a.health_score as number))[0] ?? null;

  // Novidades do catálogo (somente adições desde o último resumo)
  const { data: changes } = await supabaseAdmin
    .from("iptv_catalog_changes")
    .select("server_id, kind, name")
    .in("server_id", ids)
    .eq("action", "added")
    .gte("detected_at", sinceIso)
    .limit(4000);

  const perServer = new Map<string, Record<string, { count: number; names: string[] }>>();
  for (const c of changes ?? []) {
    const bucket = perServer.get(c.server_id) ?? {};
    const entry = bucket[c.kind] ?? { count: 0, names: [] };
    entry.count++;
    if (entry.names.length < 12) entry.names.push(String(c.name));
    bucket[c.kind] = entry;
    perServer.set(c.server_id, bucket);
  }
  const totalNews = (changes ?? []).length;
  const topServerId = Array.from(perServer.entries())
    .map(([sid, b]) => [sid, Object.values(b).reduce((a, e) => a + e.count, 0)] as const)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // Verificações / uptime / latência (tabela horária = baixo I/O)
  const { data: hourly } = await supabaseAdmin
    .from("checks_hourly")
    .select("total, ups, avg_latency_ms")
    .in("server_id", ids)
    .gte("hour", sinceIso);
  let totalChecks = 0, totalUps = 0, latSum = 0, latN = 0;
  for (const h of hourly ?? []) {
    totalChecks += h.total ?? 0;
    totalUps += h.ups ?? 0;
    if (h.avg_latency_ms != null) { latSum += h.avg_latency_ms * (h.total || 1); latN += h.total || 1; }
  }
  const uptimePct = totalChecks ? Math.round((totalUps / totalChecks) * 1000) / 10 : null;
  const avgLatency = latN ? Math.round(latSum / latN) : null;

  // Incidentes
  const { data: started } = await supabaseAdmin
    .from("incidents").select("id, server_id, started_at, ended_at")
    .in("server_id", ids).gte("started_at", sinceIso);
  const { data: resolved } = await supabaseAdmin
    .from("incidents").select("id, server_id, started_at, ended_at")
    .in("server_id", ids).gte("ended_at", sinceIso).not("ended_at", "is", null);
  let offlineSeconds = 0;
  for (const i of resolved ?? []) {
    offlineSeconds += Math.max(0, (new Date(i.ended_at as string).getTime() - new Date(i.started_at).getTime()) / 1000);
  }

  // Alertas DNS/IPTV
  const [{ data: dnsAlerts }, { data: iptvAlerts }] = await Promise.all([
    supabaseAdmin.from("dns_alerts").select("acknowledged_at").in("server_id", ids).gte("created_at", sinceIso),
    supabaseAdmin.from("iptv_alerts").select("acknowledged_at").in("server_id", ids).gte("created_at", sinceIso),
  ]);
  const allAlerts = [...(dnsAlerts ?? []), ...(iptvAlerts ?? [])];
  const alertsPending = allAlerts.filter((a) => !a.acknowledged_at).length;
  const alertsResolved = allAlerts.length - alertsPending;

  // Mudanças de IP
  const [{ data: dnsIp }, { data: iptvIp }] = await Promise.all([
    supabaseAdmin.from("dns_ip_history").select("server_id, old_ip, new_ip").in("server_id", ids).gte("changed_at", sinceIso),
    supabaseAdmin.from("iptv_ip_history").select("server_id, old_ip, new_ip").in("server_id", ids).gte("changed_at", sinceIso),
  ]);
  const ipChanges = [...(dnsIp ?? []), ...(iptvIp ?? [])];

  // SSL / domínio
  const sslSoon = servers.filter((s) => s.ssl_days_remaining != null && (s.ssl_days_remaining as number) <= 15);
  const { data: snaps } = await supabaseAdmin
    .from("dns_snapshots")
    .select("server_id, domain_expires_at, checked_at")
    .in("server_id", ids)
    .not("domain_expires_at", "is", null)
    .order("checked_at", { ascending: false })
    .limit(200);
  const domainSoon: { name: string; days: number }[] = [];
  const seenDomain = new Set<string>();
  for (const s of snaps ?? []) {
    if (seenDomain.has(s.server_id)) continue;
    seenDomain.add(s.server_id);
    const days = Math.floor((new Date(s.domain_expires_at as string).getTime() - Date.now()) / 86400000);
    if (days <= 30) domainSoon.push({ name: nameOf.get(s.server_id) ?? "-", days });
  }

  // Monta mensagem
  const first = (prof?.full_name ?? "").split(" ")[0] || "revenda";
  const L: string[] = [];
  L.push("🚀 <b>Resumo do Stream Monitor</b>", "");
  L.push(`Olá, ${esc(first)}!`, "");
  L.push("Estas foram as novidades dos seus servidores desde o último resumo.", "");
  L.push("📊 <b>Resumo</b>");
  L.push(`🖥️ Servidores monitorados: <b>${servers.length}</b>`);
  L.push(`🟢 Online: ${online}`);
  L.push(`🟡 Atenção: ${warn}`);
  L.push(`🔴 Offline: ${offline}`, "");

  if (totalNews > 0) {
    L.push("🎬 <b>Novidades dos seus servidores</b>", "");
    for (const [sid, bucket] of perServer) {
      L.push(`<b>${esc(nameOf.get(sid) ?? "-")}</b>`);
      for (const kind of ["vod", "series", "live"]) {
        const e = bucket[kind];
        if (e?.count) L.push(`➕ ${fmtCount(kind, e.count)}`);
      }
      L.push("");
    }
  } else {
    L.push("✅ Nenhuma novidade foi detectada nos seus servidores hoje.");
    L.push("Todos os servidores permanecem sincronizados.", "");
  }

  if (avgHealth != null) L.push(`📈 <b>Saúde média</b>: ${avgHealth}%`);
  if (best) L.push(`🏆 <b>Melhor servidor</b>: ${esc(best.name)} (${best.health_score}%)`);
  if (topServerId) L.push(`⚠️ <b>Mais novidades</b>: ${esc(nameOf.get(topServerId) ?? "-")}`);
  L.push("");

  L.push("🔍 <b>Desempenho</b>");
  L.push(`• Verificações: ${totalChecks}`);
  if (uptimePct != null) L.push(`• Uptime médio: ${uptimePct}%`);
  if (avgLatency != null) L.push(`• Tempo médio de resposta: ${avgLatency}ms`);
  L.push("");

  L.push("🛠️ <b>Incidentes</b>");
  L.push(`• Quedas detectadas: ${started?.length ?? 0}`);
  L.push(`• Quedas resolvidas: ${resolved?.length ?? 0}`);
  L.push(`• Tempo total offline: ${durationHuman(offlineSeconds)}`);
  L.push(`• Alertas resolvidos: ${alertsResolved} | pendentes: ${alertsPending}`);
  L.push("");

  const reminders: string[] = [];
  for (const c of ipChanges.slice(0, 6)) {
    reminders.push(`🌐 ${esc(nameOf.get(c.server_id) ?? "-")}: IP mudou ${esc(c.old_ip ?? "?")} → ${esc(c.new_ip ?? "?")}`);
  }
  for (const s of sslSoon) {
    reminders.push(`🔒 ${esc(s.name)}: certificado SSL vence em ${s.ssl_days_remaining} dias`);
  }
  for (const d of domainSoon) {
    reminders.push(`📅 ${esc(d.name)}: domínio expira em ${d.days} dias`);
  }
  if (reminders.length) {
    L.push("📅 <b>Lembretes</b>");
    L.push(...reminders.slice(0, 12));
    L.push("");
  }

  L.push("👉 https://streammonitor.site/app");

  // Modo comercial: texto pronto para divulgar
  let commercial: string | null = null;
  if (totalNews > 0) {
    const C: string[] = ["🚨 <b>Novidades disponíveis!</b>", ""];
    C.push("Acabaram de chegar novos conteúdos aos nossos servidores.", "");
    for (const [sid, bucket] of perServer) {
      C.push(`<b>${esc(nameOf.get(sid) ?? "-")}</b>`);
      for (const kind of ["vod", "series", "live"]) {
        const e = bucket[kind];
        if (!e?.count) continue;
        C.push(`${KIND_LABEL[kind]!.emoji} ${fmtCount(kind, e.count)}:`);
        C.push(e.names.slice(0, 10).map((n) => `• ${esc(n)}`).join("\n"));
        if (e.count > e.names.length) C.push(`• e mais ${e.count - e.names.length}...`);
      }
      C.push("");
    }
    C.push("Entre em contato e aproveite as últimas atualizações! 📲");
    commercial = C.join("\n").slice(0, 3900);
  }

  return {
    message: L.join("\n").slice(0, 3900),
    commercial,
    hadNews: totalNews > 0,
    summary: {
      servers: servers.length, online, warn, offline, totalNews,
      avgHealth, uptimePct, avgLatency, totalChecks,
      incidentsStarted: started?.length ?? 0, incidentsResolved: resolved?.length ?? 0,
      offlineSeconds: Math.round(offlineSeconds), alertsPending, alertsResolved,
    },
  };
}

/** Envia o resumo para todas as revendas com Telegram cadastrado e assinatura ativa. */
export async function sendDigests(kind: DigestKind): Promise<{ sent: number; skipped: number }> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { sent: 0, skipped: 0 };

  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("owner_id, target")
    .eq("kind", "telegram")
    .eq("enabled", true);
  if (!channels?.length) return { sent: 0, skipped: 0 };

  const byUser = new Map<string, { target: string | null }[]>();
  for (const ch of channels) {
    const arr = byUser.get(ch.owner_id) ?? [];
    arr.push({ target: ch.target });
    byUser.set(ch.owner_id, arr);
  }

  const userIds = Array.from(byUser.keys());
  const { data: subs } = await supabaseAdmin
    .from("subscriptions").select("user_id, status, expires_at").in("user_id", userIds);
  const nowIso = new Date().toISOString();
  const active = new Set(
    (subs ?? [])
      .filter((s) => (s.status === "active" || s.status === "trial") && s.expires_at > nowIso)
      .map((s) => s.user_id),
  );

  let sent = 0, skipped = 0;
  for (const userId of byUser.keys()) {
    if (!active.has(userId)) { skipped++; continue; }
    const r = await sendDigestToUser(userId, kind, false);
    if (r.ok) sent++; else skipped++;
  }
  return { sent, skipped };
}

/** Envia o resumo de um único usuário. `force` ignora a janela mínima de 1h. */
export async function sendDigestToUser(
  userId: string,
  kind: DigestKind = "daily",
  force = false,
): Promise<{ ok: boolean; reason?: string }> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: "Telegram não configurado" };

  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .eq("owner_id", userId)
    .eq("kind", "telegram")
    .eq("enabled", true);
  const chatIds = chatIdsFrom(channels ?? []);
  if (!chatIds.length) return { ok: false, reason: "Nenhum Telegram cadastrado" };

  try {
    const { data: last } = await supabaseAdmin
      .from("telegram_digests")
      .select("sent_at")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fallbackHours = kind === "weekly" ? 7 * 24 : 24;
    const since = last?.sent_at
      ? new Date(last.sent_at)
      : new Date(Date.now() - fallbackHours * 3600_000);
    // evita duplicidade se o cron rodar duas vezes na mesma janela
    if (!force && Date.now() - since.getTime() < 60 * 60_000) return { ok: false, reason: "Resumo recente" };

    const window = force && Date.now() - since.getTime() < 60 * 60_000
      ? new Date(Date.now() - fallbackHours * 3600_000)
      : since;

    const built = await buildDigestForUser(userId, window);
    if (!built) return { ok: false, reason: "Nenhum servidor cadastrado" };

    for (const chatId of chatIds) {
      await sendTelegram(chatId, built.message, true);
      if (built.commercial) {
        await sendTelegram(chatId, `📲 <b>Texto pronto para divulgar</b>\n\n${built.commercial}`, false);
      }
    }

    await supabaseAdmin.from("telegram_digests").insert({
      user_id: userId,
      kind,
      period_start: window.toISOString(),
      had_news: built.hadNews,
      summary: built.summary as never,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "erro" };
  }
}

