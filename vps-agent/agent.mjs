#!/usr/bin/env node
/**
 * Stream Monitor — Agente Regional (VPS) — Modo Inteligente
 *
 * Executa verificações (DNS, HTTP/HTTPS, latência, SSL, Player API, Login e
 * Streams de amostra) e envia assinado por HMAC-SHA256, porém sem inundar o
 * banco: quando o alvo está estável, envia apenas um heartbeat agregado; os
 * detalhes completos só são gravados quando algo muda ou falha.
 *
 * Config por variáveis de ambiente (ver /etc/streammonitor-agent.env):
 *   SM_BASE_URL       ex: https://streammonitor.site
 *   SM_AGENT_ID       uuid do agente
 *   SM_AGENT_SECRET   segredo HMAC do agente
 *   SM_REGION         ex: br-sp-vps
 *   SM_INTERVAL       segundos entre rodadas (padrão 30)
 *   SM_CONCURRENCY    verificações simultâneas (padrão 8)
 *   SM_HEARTBEAT_MIN  minutos entre heartbeats quando estável (padrão 10)
 *   SM_DEEP_EVERY     ciclos entre testes profundos quando estável (padrão 20)
 *   SM_LATENCY_FACTOR multiplicador da média para considerar latência anormal (padrão 2.5)
 */
import { createHmac } from "node:crypto";
import dns from "node:dns/promises";
import tls from "node:tls";

const BASE = (process.env.SM_BASE_URL || "https://streammonitor.site").replace(/\/$/, "");
const AGENT_ID = process.env.SM_AGENT_ID;
const SECRET = process.env.SM_AGENT_SECRET;
const REGION = process.env.SM_REGION || "br-sp-vps";
const INTERVAL = Number(process.env.SM_INTERVAL || 30) * 1000;
const CONCURRENCY = Number(process.env.SM_CONCURRENCY || 8);
const HEARTBEAT_MS = Number(process.env.SM_HEARTBEAT_MIN || 10) * 60 * 1000;
const DEEP_EVERY = Number(process.env.SM_DEEP_EVERY || 20);
const LATENCY_FACTOR = Number(process.env.SM_LATENCY_FACTOR || 2.5);
const TIMEOUT = 12000;

if (!AGENT_ID || !SECRET) {
  console.error("SM_AGENT_ID e SM_AGENT_SECRET são obrigatórios.");
  process.exit(1);
}

const sign = (msg) => createHmac("sha256", SECRET).update(msg).digest("hex");
const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Estado local por alvo: evita gravações desnecessárias no banco. */
const state = new Map(); // server_id -> { status, avg, sentAt, cycles, samples }

async function withTimeout(fn, ms = TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

async function fetchTargets() {
  const res = await fetch(`${BASE}/api/public/regions/targets`, {
    headers: { "x-agent-id": AGENT_ID, "x-signature": sign("targets") },
  });
  if (!res.ok) throw new Error(`targets ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.targets || [];
}

function hostOnly(raw) {
  let h = String(raw || "").trim();
  h = h.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return h.split(":")[0];
}
function portOf(raw) {
  const m = String(raw || "").match(/:(\d{2,5})(\/|$)/);
  return m ? Number(m[1]) : 80;
}

async function checkDns(host) {
  const t0 = Date.now();
  try {
    const ips = await dns.resolve4(host);
    return { ok: true, ms: Date.now() - t0, ip: ips[0] || null, ips };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.code || e.message };
  }
}

async function checkSsl(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      const days = cert?.valid_to
        ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000)
        : null;
      socket.end();
      resolve({ ok: true, days_remaining: days, issuer: cert?.issuer?.O || null });
    });
    socket.on("error", (e) => resolve({ ok: false, error: e.code || e.message }));
    socket.on("timeout", () => { socket.destroy(); resolve({ ok: false, error: "TIMEOUT" }); });
  });
}

async function checkHttp(host, port) {
  const url = `http://${host}:${port}/`;
  const t0 = Date.now();
  try {
    const res = await withTimeout((signal) =>
      fetch(url, { method: "GET", redirect: "manual", signal, headers: { "user-agent": "StreamMonitorAgent/2.0" } }));
    return { ok: res.status < 500, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - t0, error: e.name === "AbortError" ? "TIMEOUT" : (e.cause?.code || e.message) };
  }
}

async function checkPlayerApi(host, port, iptv) {
  if (!iptv?.username) return null;
  const url = `http://${host}:${port}/player_api.php?username=${encodeURIComponent(iptv.username)}&password=${encodeURIComponent(iptv.password)}`;
  const t0 = Date.now();
  try {
    const res = await withTimeout((s) => fetch(url, { signal: s }));
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, status: res.status, login: false };
    let json = null;
    try { json = await res.json(); } catch { /* html/erro */ }
    const login = Boolean(json?.user_info?.auth === 1 || json?.user_info?.status === "Active");
    return { ok: Boolean(json), ms, status: res.status, login, expires: json?.user_info?.exp_date ?? null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, login: false, error: e.name === "AbortError" ? "TIMEOUT" : (e.cause?.code || e.message) };
  }
}

async function checkSampleStream(host, port, iptv) {
  if (!iptv?.username) return null;
  try {
    const listUrl = `http://${host}:${port}/player_api.php?username=${encodeURIComponent(iptv.username)}&password=${encodeURIComponent(iptv.password)}&action=get_live_streams`;
    const res = await withTimeout((s) => fetch(listUrl, { signal: s }));
    const list = await res.json();
    const sample = Array.isArray(list) ? list.slice(0, 2) : [];
    const results = [];
    for (const item of sample) {
      const su = `http://${host}:${port}/${encodeURIComponent(iptv.username)}/${encodeURIComponent(iptv.password)}/${item.stream_id}.ts`;
      const t0 = Date.now();
      try {
        const r = await withTimeout((s) => fetch(su, { headers: { range: "bytes=0-65535" }, signal: s }), 10000);
        const buf = await r.arrayBuffer();
        results.push({ id: item.stream_id, ok: r.ok && buf.byteLength > 1024, bytes: buf.byteLength, ms: Date.now() - t0 });
      } catch (e) {
        results.push({ id: item.stream_id, ok: false, error: e.name === "AbortError" ? "TIMEOUT" : (e.cause?.code || e.message) });
      }
    }
    return { tested: results.length, ok: results.filter((r) => r.ok).length, samples: results };
  } catch (e) {
    return { tested: 0, ok: 0, error: e.message };
  }
}

async function checkTarget(t) {
  const host = hostOnly(t.host);
  const port = portOf(t.host);
  const st = state.get(t.server_id) || { status: null, avg: null, sentAt: 0, cycles: 0, samples: 0 };
  st.cycles++;

  const [dnsR, httpR] = await Promise.all([checkDns(host), checkHttp(host, port)]);

  // Testes profundos: sempre quando há suspeita de problema; quando estável,
  // apenas a cada SM_DEEP_EVERY ciclos (economiza banda, CPU e banco).
  const suspicious = !dnsR.ok || !httpR.ok || st.status !== "up";
  const deep = suspicious || st.cycles % DEEP_EVERY === 0;

  const ssl = deep ? await checkSsl(host).catch(() => null) : null;
  const api = deep ? await checkPlayerApi(host, port, t.iptv) : null;
  const streams = deep && api?.login ? await checkSampleStream(host, port, t.iptv) : null;

  let status = "up";
  if (!dnsR.ok || !httpR.ok) status = "down";
  else if ((api && api.ok === false) || (streams && streams.tested > 0 && streams.ok === 0)) status = "degraded";
  else if (httpR.ms > 4000) status = "degraded";

  // Latência anormal em relação à média móvel do próprio alvo.
  const latency = httpR.ms ?? null;
  const abnormal =
    latency != null && st.avg != null && st.samples >= 5 &&
    latency > Math.max(st.avg * LATENCY_FACTOR, st.avg + 300);

  if (latency != null) {
    st.avg = st.avg == null ? latency : st.avg * 0.8 + latency * 0.2;
    st.samples++;
  }

  const changed = st.status !== null && st.status !== status;
  const firstSeen = st.status === null;
  const problem = status !== "up";
  const errored = Boolean(httpR.error || dnsR.error);
  const failedTest = Boolean((api && api.ok === false) || (streams && streams.tested > 0 && streams.ok === 0));
  const heartbeatDue = Date.now() - st.sentAt >= HEARTBEAT_MS;

  const detailed = changed || firstSeen || problem || errored || abnormal || failedTest;
  const shouldSend = detailed || heartbeatDue;

  st.status = status;
  state.set(t.server_id, st);

  if (!shouldSend) return null;
  st.sentAt = Date.now();

  const reasonTags = [
    changed && "status_change", firstSeen && "first_seen", problem && "problem",
    errored && "error", abnormal && "latency_spike", failedTest && "test_failed",
  ].filter(Boolean);

  return {
    server_id: t.server_id,
    region_code: REGION,
    status,
    http_status: httpR.status ?? null,
    latency_ms: latency,
    error: httpR.error || dnsR.error || null,
    source: "vps",
    details: detailed
      ? { mode: "full", reason: reasonTags, avg_latency_ms: st.avg ? Math.round(st.avg) : null,
          dns: dnsR, http: httpR, ssl, player_api: api, streams }
      : { mode: "heartbeat", avg_latency_ms: st.avg ? Math.round(st.avg) : null,
          cycles: st.cycles, http_status: httpR.status ?? null },
  };
}

async function runPool(items, worker, size) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        const r = await worker(items[idx]);
        if (r) out.push(r);
      } catch (e) { log("erro alvo:", e.message); }
    }
  }));
  return out;
}

async function report(reports) {
  for (let i = 0; i < reports.length; i += 100) {
    const chunk = reports.slice(i, i + 100);
    const body = JSON.stringify({ reports: chunk });
    const res = await fetch(`${BASE}/api/public/regions/report`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": AGENT_ID,
        "x-signature": sign(body),
      },
      body,
    });
    if (!res.ok) log("falha no envio:", res.status, await res.text());
  }
}

async function cycle() {
  const t0 = Date.now();
  const targets = await fetchTargets();
  if (!targets.length) return log("nenhum alvo ativo");
  const reports = await runPool(targets, checkTarget, CONCURRENCY);
  if (reports.length) await report(reports);
  log(`ciclo ok: ${targets.length} alvos verificados, ${reports.length} enviados em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function main() {
  log(`Agente Stream Monitor (modo inteligente) — região ${REGION} → ${BASE}`);
  for (;;) {
    try { await cycle(); } catch (e) { log("erro no ciclo:", e.message); }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}
main();
