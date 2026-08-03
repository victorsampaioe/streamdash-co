// Server-only monitoring engine. Uses admin client to write checks/incidents.
import { promises as dns } from "node:dns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FETCH_TIMEOUT_MS = 8000;
const SSL_TIMEOUT_MS = 6000;

type ServerRow = {
  id: string;
  owner_id: string;
  name: string;
  host: string;
  interval_seconds: number;
  failure_threshold: number;
  current_status: string;
  consecutive_failures: number;
  last_checked_at: string | null;
};

export async function runCheckForServer(serverId: string) {
  const { data: server, error } = await supabaseAdmin
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .maybeSingle();
  if (error || !server) throw new Error("Servidor não encontrado");
  return await performCheck(server as ServerRow);
}

export async function runDueChecks() {
  const now = Date.now();
  const { data: servers, error } = await supabaseAdmin.from("servers").select("*");
  if (error) throw error;

  // Only monitor servers of users with an active subscription.
  // When trial/subscription expires, monitoring pauses until they renew via PIX.
  const ownerIds = Array.from(new Set((servers ?? []).map((s: any) => s.owner_id)));
  const activeOwners = new Set<string>();
  if (ownerIds.length) {
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, status, expires_at")
      .in("user_id", ownerIds);
    const nowIso = new Date().toISOString();
    for (const s of subs ?? []) {
      if ((s.status === "active" || s.status === "trial") && s.expires_at > nowIso) {
        activeOwners.add(s.user_id);
      }
    }
  }

  const due = (servers ?? []).filter((s: any) => {
    if (!activeOwners.has(s.owner_id)) return false;
    if (!s.last_checked_at) return true;
    return now - new Date(s.last_checked_at).getTime() >= s.interval_seconds * 1000;
  });
  const results = await Promise.allSettled(due.map((s: any) => performCheck(s as ServerRow)));
  return {
    checked: results.length,
    ok: results.filter((r) => r.status === "fulfilled").length,
    errors: results.filter((r) => r.status === "rejected").length,
  };
}

async function performCheck(server: ServerRow) {
  const startedAt = Date.now();
  let status: "up" | "down" | "degraded" | "unknown" = "unknown";
  let httpStatus: number | null = null;
  let latency: number | null = null;
  let dnsIp: string | null = null;
  let sslDays: number | null = null;
  let errorMsg: string | null = null;

  // 1) DNS
  try {
    const addrs = await dns.lookup(server.host, { all: false });
    dnsIp = addrs.address;
  } catch (e: any) {
    errorMsg = `DNS: ${e?.message ?? "erro"}`;
    status = "down";
  }

  // 2) HTTP on port 80 (fixed)
  if (status !== "down") {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const url = `http://${server.host}:80/`;
      const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
      clearTimeout(t);
      latency = Date.now() - startedAt;
      httpStatus = res.status;
      if (res.status >= 200 && res.status < 400) status = latency > 3000 ? "degraded" : "up";
      else if (res.status >= 400 && res.status < 500) status = "degraded";
      else status = "down";
    } catch (e: any) {
      status = "down";
      errorMsg = errorMsg ?? `HTTP: ${e?.message ?? "timeout"}`;
      latency = Date.now() - startedAt;
    }
  }

  // 3) SSL (opportunistic, non-fatal)
  try {
    sslDays = await getSslDaysRemaining(server.host);
  } catch { /* ignore */ }

  // Record check
  await supabaseAdmin.from("checks").insert({
    server_id: server.id,
    status,
    http_status: httpStatus,
    latency_ms: latency,
    dns_resolved_ip: dnsIp,
    ssl_days_remaining: sslDays,
    error: errorMsg,
  });

  // Also record as an "origin" region datapoint for the Global Map
  await supabaseAdmin.from("region_checks").insert({
    server_id: server.id,
    region_code: "origin",
    status,
    http_status: httpStatus,
    latency_ms: latency,
    error: errorMsg,
  });

  // Update server aggregates
  const isFailure = status === "down";
  const newConsecutive = isFailure ? server.consecutive_failures + 1 : 0;
  const wasDown = server.current_status === "down";

  // Janela de confirmação: só alerta depois que a falha (ou a recuperação)
  // persistir por ~2 minutos de verificações consecutivas.
  const { data: recent } = await supabaseAdmin
    .from("checks")
    .select("status, checked_at")
    .eq("server_id", server.id)
    .order("checked_at", { ascending: false })
    .limit(20);
  const rows = recent ?? [];
  const streakMs = (isDown: boolean) => {
    let last: number | null = null;
    for (const r of rows) {
      if ((r.status === "down") !== isDown) break;
      last = new Date(r.checked_at).getTime();
    }
    return last == null ? 0 : Date.now() - last;
  };

  const downConfirmed = isFailure
    && newConsecutive >= server.failure_threshold
    && streakMs(true) >= CONFIRM_WINDOW_MS;
  const upConfirmed = !isFailure && streakMs(false) >= CONFIRM_WINDOW_MS;

  // Estado intermediário "Instabilidade detectada" enquanto não há confirmação.
  let displayStatus: typeof status = status;
  if (isFailure && !downConfirmed) displayStatus = "degraded";
  else if (!isFailure && wasDown && !upConfirmed) displayStatus = "degraded";

  await supabaseAdmin.from("servers").update({
    current_status: displayStatus,
    last_checked_at: new Date().toISOString(),
    last_latency_ms: latency,
    ssl_days_remaining: sslDays,
    consecutive_failures: newConsecutive,
  }).eq("id", server.id);

  // Incident handling + alerts (somente após confirmação)
  const { data: openIncident } = await supabaseAdmin
    .from("incidents")
    .select("id")
    .eq("server_id", server.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (downConfirmed && !openIncident) {
    const { data: inc } = await supabaseAdmin.from("incidents").insert({
      server_id: server.id,
      reason: errorMsg ?? `HTTP ${httpStatus ?? "-"}`,
    }).select("id").single();
    if (inc) await sendAlerts(server, "down", `${server.name} está OFFLINE (confirmado em ~2min) — ${errorMsg ?? httpStatus ?? "sem resposta"}`, inc.id);
  } else if (upConfirmed && openIncident) {
    await supabaseAdmin.from("incidents").update({ ended_at: new Date().toISOString() }).eq("id", openIncident.id);
    await sendAlerts(server, "up", `${server.name} voltou ao AR e está estável (${latency}ms)`, openIncident.id);
  }

  return { status: displayStatus, rawStatus: status, latency, httpStatus, sslDays, dnsIp, error: errorMsg };
}


async function getSslDaysRemaining(host: string): Promise<number | null> {
  return await new Promise((resolve) => {
    // dynamic import to avoid bundling in client
    import("node:tls").then((tls) => {
      const socket = tls.connect({ host, port: 443, servername: host, timeout: SSL_TIMEOUT_MS, rejectUnauthorized: false }, () => {
        const cert = (socket as any).getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return resolve(null);
        const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
        resolve(days);
      });
      socket.on("error", () => resolve(null));
      socket.on("timeout", () => { socket.destroy(); resolve(null); });
    }).catch(() => resolve(null));
  });
}

async function sendAdminCopy(server: ServerRow, event: "up" | "down", message: string) {
  try {
    const { notifyAdmin } = await import("./admin-telegram.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", server.owner_id)
      .maybeSingle();
    const esc = (s: unknown) =>
      String(s ?? "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
    const hasCreds = Boolean((server as any).iptv_username && (server as any).iptv_password);
    await notifyAdmin(
      `${event === "down" ? "🔴 <b>DNS OFFLINE</b>" : "🟢 <b>DNS recuperado</b>"}\n` +
        `${esc(message)}\n` +
        `Revenda: ${esc(prof?.full_name)} — ${esc(prof?.email)}\n` +
        `Host: <code>${esc(server.host)}</code>${hasCreds ? "\nIPTV: credenciais ativas ✅" : ""}`,
    );
  } catch { /* nunca quebrar o alerta do cliente */ }
}

async function sendAlerts(server: ServerRow, event: "up" | "down", message: string, incidentId: string | null) {
  // Cópia para o Telegram do admin (independente dos canais da revenda)
  await sendAdminCopy(server, event, message);

  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("*")
    .eq("owner_id", server.owner_id)
    .eq("enabled", true);
  if (!channels || channels.length === 0) return;


  await Promise.allSettled(channels.map(async (ch: any) => {
    try {
      let ok = false;
      let response = "";
      if (ch.kind === "discord") {
        const r = await fetch(ch.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "StreamMonitor",
            embeds: [{
              title: `${event === "down" ? "🔴 OFFLINE" : "🟢 ONLINE"} — ${server.name}`,
              description: message,
              color: event === "down" ? 15679045 : 3066993,
              timestamp: new Date().toISOString(),
              fields: [{ name: "Host", value: server.host, inline: true }],
            }],
          }),
        });
        ok = r.ok; response = `${r.status}`;
      } else if (ch.kind === "webhook") {
        const r = await fetch(ch.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, server: { id: server.id, name: server.name, host: server.host }, message, at: new Date().toISOString() }),
        });
        ok = r.ok; response = `${r.status}`;
      } else if (ch.kind === "telegram") {
        // Prefer shared bot via TELEGRAM_BOT_TOKEN; target is just the chat_id.
        // Backwards-compat: if target contains ":", treat as "BOT_TOKEN:CHAT_ID".
        const sharedToken = process.env.TELEGRAM_BOT_TOKEN;
        let botToken = sharedToken ?? "";
        let chatId = ch.target?.trim() ?? "";
        if (chatId.includes(":")) {
          const [t, c] = chatId.split(":");
          botToken = t; chatId = c;
        }
        if (!botToken || !chatId) { ok = false; response = "TELEGRAM_BOT_TOKEN ausente ou chat_id inválido"; }
        else {
          const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `${event === "down" ? "🔴" : "🟢"} ${message}` }),
          });
          ok = r.ok; response = `${r.status}`;
        }
      } else if (ch.kind === "email") {
        const key = process.env.RESEND_API_KEY;
        if (!key) { ok = false; response = "RESEND_API_KEY ausente"; }
        else {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              from: "StreamMonitor <onboarding@resend.dev>",
              to: [ch.target],
              subject: `[${event === "down" ? "OFFLINE" : "ONLINE"}] ${server.name}`,
              html: `<p>${message}</p><p><small>Host: ${server.host}</small></p>`,
            }),
          });
          ok = r.ok; response = `${r.status}`;
        }
      }
      await supabaseAdmin.from("notifications_log").insert({
        incident_id: incidentId, server_id: server.id, channel_id: ch.id, event, ok, response: response.slice(0, 300),
      });
    } catch (e: any) {
      await supabaseAdmin.from("notifications_log").insert({
        incident_id: incidentId, server_id: server.id, channel_id: ch.id, event, ok: false, response: String(e?.message ?? e).slice(0, 300),
      });
    }
  }));
}

// Exported so the /api/public/regions/report endpoint can trigger alerts
// when a specific region transitions to down or recovers.
export async function sendRegionAlert(args: {
  serverId: string;
  region: { code: string; name: string; city: string; flag: string };
  event: "up" | "down";
  latencyMs: number | null;
  error: string | null;
}) {
  const { data: server } = await supabaseAdmin
    .from("servers")
    .select("*")
    .eq("id", args.serverId)
    .maybeSingle();
  if (!server) return;
  const detail = args.event === "down"
    ? `${args.region.flag} ${args.region.city}: OFFLINE${args.error ? ` — ${args.error}` : ""}`
    : `${args.region.flag} ${args.region.city}: recuperado${args.latencyMs != null ? ` (${args.latencyMs}ms)` : ""}`;
  const message = `${server.name} — ${detail}`;
  await sendAlerts(server as ServerRow, args.event, message, null);
}

