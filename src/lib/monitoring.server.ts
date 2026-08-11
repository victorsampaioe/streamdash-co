// Server-only monitoring engine. Uses admin client to write checks/incidents.
import { promises as dns } from "node:dns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FETCH_TIMEOUT_MS = 8000;
const SSL_TIMEOUT_MS = 6000;
// Modo "Confirmação de Queda": novas verificações a cada ~20s durante ~2 minutos.
const CONFIRM_PROBE_INTERVAL_MS = 20_000;
const DOWN_CONFIRM_PROBES = 6;   // ~2 minutos
const UP_CONFIRM_PROBES = 3;     // ~1 minuto
const DOWN_CONFIRM_RATIO = 0.8;  // 80% ou mais das checagens falhando


type ServerRow = {
  id: string;
  owner_id: string;
  name: string;
  host: string;
  server_group?: string | null;
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

  const { getActiveOwnerIds, MONITORING_PAUSED_MESSAGE, syncServersPauseState } = await import("./service-status.server");
  const active = await getActiveOwnerIds([(server as any).owner_id]);
  if (!active.has((server as any).owner_id)) {
    await syncServersPauseState([(server as any).owner_id]).catch(() => null);
    throw new Error(MONITORING_PAUSED_MESSAGE);
  }

  return await performCheck(server as ServerRow);
}

export async function runDueChecks() {
  const now = Date.now();
  const { data: servers, error } = await supabaseAdmin.from("servers").select("*").eq("monitoring_paused", false);
  if (error) throw error;

  // Só monitora servidores de contas ativas:
  // Cliente -> assinatura válida | Revendedor -> créditos > 0 | Admin -> sempre.
  const { getActiveOwnerIds } = await import("./service-status.server");
  const activeOwners = await getActiveOwnerIds((servers ?? []).map((s: any) => s.owner_id));

  const paused = (servers ?? []).filter((s: any) => !activeOwners.has(s.owner_id));

  const due = (servers ?? []).filter((s: any) => {
    if (!activeOwners.has(s.owner_id)) return false;
    if (!s.last_checked_at) return true;
    return now - new Date(s.last_checked_at).getTime() >= s.interval_seconds * 1000;
  });
  // Fila com limite de concorrência + jitter: evita rajadas simultâneas que
  // provocam bloqueio de IP nos servidores monitorados e mantém o uso de
  // memória/soquetes estável na VPS 24/7.
  const { runPool } = await import("./pool");
  const results = await runPool(due as any[], (s: any) => performCheck(s as ServerRow));
  return {
    checked: results.length,
    ok: results.filter((r) => r.status === "fulfilled").length,
    errors: results.filter((r) => r.status === "rejected").length,
    pausedBySubscription: paused.length,
  };
}

type ProbeResult = {
  status: "up" | "down" | "degraded" | "unknown";
  httpStatus: number | null;
  latency: number | null;
  dnsIp: string | null;
  error: string | null;
};

/** Traduz o erro técnico em um motivo compreensível para a revenda. */
function classifyError(e: any, phase: "dns" | "http", latency: number | null): string {
  const raw = String(e?.code ?? e?.cause?.code ?? e?.message ?? "").toLowerCase();
  if (phase === "dns") {
    if (raw.includes("enotfound") || raw.includes("nxdomain")) return "DNS não encontrado (domínio não resolve)";
    if (raw.includes("timeout") || raw.includes("etimeout")) return "Timeout na resolução de DNS";
    return "Falha de DNS";
  }
  if (raw.includes("abort") || raw.includes("etimedout") || raw.includes("timeout")) {
    return `Timeout de conexão (sem resposta em ${Math.round(FETCH_TIMEOUT_MS / 1000)}s)`;
  }
  if (raw.includes("econnrefused")) return "Conexão recusada pelo servidor";
  if (raw.includes("econnreset") || raw.includes("epipe")) return "Conexão interrompida (instabilidade temporária)";
  if (raw.includes("ehostunreach") || raw.includes("enetunreach")) return "Host inacessível na rede";
  if (raw.includes("cert") || raw.includes("ssl") || raw.includes("tls")) return "Certificado SSL inválido";
  if (latency != null && latency >= FETCH_TIMEOUT_MS) return "Latência muito alta";
  return `Instabilidade temporária${raw ? ` (${raw.slice(0, 60)})` : ""}`;
}

function classifyHttp(code: number, latency: number | null): string | null {
  if (code >= 500) {
    if (code === 502) return "HTTP 502 — Bad Gateway";
    if (code === 503) return "HTTP 503 — Serviço indisponível";
    if (code === 504) return "HTTP 504 — Gateway Timeout";
    return `HTTP ${code} — Erro interno do servidor`;
  }
  if (code === 403) return "HTTP 403 — Acesso bloqueado";
  if (code === 404) return "HTTP 404 — Recurso não encontrado";
  if (code >= 400) return `HTTP ${code} — Resposta inesperada`;
  if (latency != null && latency > 3000) return `Latência muito alta (${latency}ms)`;
  return null;
}

/** Uma verificação isolada (DNS + HTTP porta 80). */
async function probe(host: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  let status: ProbeResult["status"] = "unknown";
  let httpStatus: number | null = null;
  let latency: number | null = null;
  let dnsIp: string | null = null;
  let errorMsg: string | null = null;

  try {
    const addrs = await dns.lookup(host, { all: false });
    dnsIp = addrs.address;
  } catch (e: any) {
    errorMsg = classifyError(e, "dns", null);
    status = "down";
  }

  if (status !== "down") {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`http://${host}:80/`, { method: "GET", redirect: "manual", signal: controller.signal });
      clearTimeout(t);
      latency = Date.now() - startedAt;
      httpStatus = res.status;
      errorMsg = classifyHttp(res.status, latency);
      if (res.status >= 200 && res.status < 400) status = latency > 3000 ? "degraded" : "up";
      else if (res.status >= 400 && res.status < 500) status = "degraded";
      else status = "down";
    } catch (e: any) {
      latency = Date.now() - startedAt;
      status = "down";
      errorMsg = errorMsg ?? classifyError(e, "http", latency);
    }
  }

  return { status, httpStatus, latency, dnsIp, error: errorMsg };
}

async function recordCheck(serverId: string, p: ProbeResult, sslDays: number | null) {
  await supabaseAdmin.from("checks").insert({
    server_id: serverId,
    status: p.status,
    http_status: p.httpStatus,
    latency_ms: p.latency,
    dns_resolved_ip: p.dnsIp,
    ssl_days_remaining: sslDays,
    error: p.error,
  });
  await supabaseAdmin.from("region_checks").insert({
    server_id: serverId,
    region_code: "origin",
    status: p.status,
    http_status: p.httpStatus,
    latency_ms: p.latency,
    error: p.error,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Modo "Confirmação": novas verificações a cada ~20s, gravando cada uma no histórico. */
async function confirmationBurst(server: ServerRow, probes: number, sslDays: number | null) {
  const results: ProbeResult[] = [];
  for (let i = 0; i < probes; i++) {
    await sleep(CONFIRM_PROBE_INTERVAL_MS);
    const p = await probe(server.host);
    await recordCheck(server.id, p, sslDays);
    results.push(p);
  }
  return results;
}

async function performCheck(server: ServerRow) {
  const first = await probe(server.host);

  // SSL (oportunista, não fatal)
  let sslDays: number | null = null;
  try {
    sslDays = await getSslDaysRemaining(server.host);
  } catch { /* ignore */ }

  await recordCheck(server.id, first, sslDays);

  const wasDown = server.current_status === "down";
  let final = first;
  let displayStatus: ProbeResult["status"] = first.status;
  let downConfirmed = false;
  let upConfirmed = false;
  let confirmNote = "";

  if (first.status === "down") {
    // Só entra em confirmação se já não estiver confirmado como DOWN
    if (!wasDown) {
      const burst = await confirmationBurst(server, DOWN_CONFIRM_PROBES, sslDays);
      const all = [first, ...burst];
      const fails = all.filter((p) => p.status === "down").length;
      const ratio = fails / all.length;
      final = burst[burst.length - 1] ?? first;
      if (ratio >= DOWN_CONFIRM_RATIO) {
        downConfirmed = true;
        displayStatus = "down";
        confirmNote = `${fails}/${all.length} verificações falharam em ~2min`;
      } else {
        // Instabilidade isolada -> degradado, mas não muda status base se era UP
        displayStatus = wasDown ? "down" : "degraded";
      }
    } else {
      displayStatus = "down";
    }
  } else if (wasDown) {
    // Retorno detectado -> confirmar estabilidade por ~1 minuto.
    const burst = await confirmationBurst(server, UP_CONFIRM_PROBES, sslDays);
    const all = [first, ...burst];
    final = burst[burst.length - 1] ?? first;
    upConfirmed = all.every((p) => p.status !== "down");
    // Só volta a ser UP se todas as checagens do burst passarem
    displayStatus = upConfirmed ? final.status : "down";
  }

  const newConsecutive = downConfirmed
    ? server.consecutive_failures + 1
    : first.status === "down"
      ? server.consecutive_failures + 1
      : 0;

  await supabaseAdmin.from("servers").update({
    current_status: displayStatus,
    last_checked_at: new Date().toISOString(),
    last_latency_ms: final.latency,
    ssl_days_remaining: sslDays,
    consecutive_failures: newConsecutive,
  }).eq("id", server.id);

  // Busca incidente aberto
  const { data: openIncident } = await supabaseAdmin
    .from("incidents")
    .select("id")
    .eq("server_id", server.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reason = final.error ?? first.error ?? `HTTP ${final.httpStatus ?? "-"}`;

  // LÓGICA DE TRANSIÇÃO DE ESTADO REAL
  if (downConfirmed && !openIncident) {
    // Transição: QUALQUER -> OFFLINE_CONFIRMED
    const { data: inc } = await supabaseAdmin.from("incidents").insert({
      server_id: server.id,
      reason,
    }).select("id").single();
    
    if (inc) {
      const idempotencyKey = `${server.id}_${inc.id}_down`;
      const { error: idError } = await supabaseAdmin.from("alert_idempotency" as any).insert({ id: idempotencyKey });
      
      if (!idError) {
        // Melhorar alertas Telegram de queda: Agrupamento de incidentes e remoção de dados sensíveis.
        let message = `🚨 <b>${server.name} está OFFLINE</b>\n\n` +
          `Confirmado: ${confirmNote}\n` +
          `Motivo: ${reason}\n` +
          `Região: 🇧🇷 São Paulo (Confirmado via VPS)`;
        
        try {
          const { analyzeCorrelation, recordCorrelationEvent, correlationMessage } = await import("./correlation.server");
          const corr = await analyzeCorrelation(server as any);
          await recordCorrelationEvent(server as any, corr);
          // O correlationMessage deve respeitar a privacidade
        } catch { /* ignore */ }
        await sendAlerts(server, "down", message, inc.id);
      }
    }
  } else if (upConfirmed && openIncident) {
    // Transição: OFFLINE_CONFIRMED -> ONLINE
    // Apenas se o status anterior no banco fosse REALMENTE down
    if (wasDown) {
      const idempotencyKey = `${server.id}_${openIncident.id}_up`;
      const { error: idError } = await supabaseAdmin.from("alert_idempotency" as any).insert({ id: idempotencyKey });

      if (!idError) {
        await supabaseAdmin.from("incidents").update({ ended_at: new Date().toISOString() }).eq("id", openIncident.id);
        await supabaseAdmin.from("servers").update({ recovery_alert_sent_at: new Date().toISOString() } as any).eq("id", server.id);
        
        let recoveryTime = "";
        try {
          const { closeCorrelationEvent } = await import("./correlation.server");
          const secs = await closeCorrelationEvent(server.id);
          if (secs != null) recoveryTime = `\nTempo até a recuperação: ${secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}min`}`;
        } catch { /* ignore */ }
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        
        const message = `✅ <b>Serviço normalizado</b>\n\n` +
          `Servidor:\n${server.name}\n\n` +
          `Região confirmada:\n🇧🇷 São Paulo\n\n` +
          `Status:\nOnline novamente\n\n` +
          `Detectado:\n${timeStr}`;

        await sendAlerts(server, "up", message, openIncident.id);
      }
    }
  }


  return {
    status: displayStatus,
    rawStatus: first.status,
    latency: final.latency,
    httpStatus: final.httpStatus,
    sslDays,
    dnsIp: final.dnsIp,
    error: reason,
  };
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
      `${event === "down" ? "🚨 <b>OFFLINE CONFIRMADO</b>" : "✅ <b>SERVIÇO RESTABELECIDO</b>"}\n` +
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
        const sharedToken = process.env.TELEGRAM_BOT_TOKEN;
        let botToken = sharedToken ?? "";
        let chatId = ch.target?.trim() ?? "";
        if (chatId.includes(":")) {
          const [t, c] = chatId.split(":");
          botToken = t; chatId = c;
        }

        if (botToken && chatId) {
          if (event === "up") {
            // Queue recovery notifications for grouping
            await supabaseAdmin.from("notification_queue").insert({
              owner_id: server.owner_id,
              server_id: server.id,
              channel_id: ch.id,
              event: "up",
              message: message
            });
            ok = true;
            response = "Queued for grouping";
          } else {
            // Send DOWN alerts immediately (critical)
            const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                chat_id: chatId, 
                text: message,
                parse_mode: "HTML"
              }),
            });
            ok = r.ok;
            response = `${r.status}`;
          }
        } else {
          ok = false;
          response = "Configuração do Telegram inválida";
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
// A mensagem é consolidada: mostra o veredito de consenso e a checagem
// de cada região, em vez de um alerta isolado por ponto de monitoramento.
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

  // Situação atual de cada região (janela de 15 min).
  const { data: regions } = await supabaseAdmin
    .from("check_regions")
    .select("code, city, flag")
    .eq("enabled", true);

  const { data: recent } = await supabaseAdmin
    .from("region_checks")
    .select("region_code, status, latency_ms, checked_at")
    .eq("server_id", args.serverId)
    .gte("checked_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .order("checked_at", { ascending: false })
    .limit(500);

  const latest = new Map<string, { status: string; latency_ms: number | null }>();
  for (const r of recent ?? []) {
    if (!latest.has(r.region_code)) latest.set(r.region_code, { status: r.status, latency_ms: r.latency_ms });
  }

  const icon = (s?: string) =>
    s === "up" ? "✅" : s === "down" ? "❌" : s === "degraded" ? "⚠️" : "➖";

  const lines = (regions ?? [])
    .filter((r) => r.code !== "origin" || latest.has(r.code))
    .map((r) => {
      const l = latest.get(r.code);
      const ms = l?.latency_ms != null ? ` (${l.latency_ms}ms)` : "";
      return `${r.flag} ${r.city} ${icon(l?.status)}${ms}`;
    });

  const downs = [...latest.values()].filter((l) => l.status === "down").length;
  const total = latest.size;
  const at = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  const header = args.event === "down"
    ? `🚨 OFFLINE CONFIRMADO — ${downs} de ${total} regiões detectaram falha`
    : `✅ SERVIÇO RESTABELECIDO — confirmado por ${total - downs} de ${total} regiões`;

  const message =
    `${header}\n\n` +
    `Servidor: ${server.name}\n\n` +
    `Confirmação:\n${lines.join("\n")}\n\n` +
    (args.error && args.event === "down" ? `Motivo: ${args.error}\n` : "") +
    `Detectado às ${at}`;

  await sendAlerts(server as ServerRow, args.event, message, null);
}


