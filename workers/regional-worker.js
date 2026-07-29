/**
 * StreamMonitor — Worker regional (Cloudflare)
 * Cole este arquivo inteiro no editor da Cloudflare (Workers > Quick Edit).
 *
 * Variáveis (Settings > Variables):
 *   REGION_CODE           = sa-east-1 | us-east-1 | eu-central-1 | ap-northeast-1
 *   ENDPOINT_BASE         = https://streammonitor.site
 *   REGION_WORKER_SECRET  = (Secret / Encrypt) mesmo valor salvo no painel
 *
 * Cron Trigger (Settings > Triggers):  a cada 1 minuto  (asterisco/1 espaco * * * *)
 *
 * IMPORTANTE: o plano Free da Cloudflare permite ~50 subrequests por invocação.
 * Por isso cada execução checa no máximo MAX_PER_RUN alvos (rotacionando a cada
 * minuto) e envia TODOS os resultados em UM único POST em lote.
 */

const TIMEOUT_MS = 8000;
const MAX_PER_RUN = 40;   // 40 checks + 1 targets + 1 report = 42 subrequests
const CONCURRENCY = 10;

/** Remove espaços/quebras de linha/aspas que o painel da Cloudflare costuma colar junto. */
function cleanSecret(env) {
  return String(env.REGION_WORKER_SECRET ?? "").trim().replace(/^["']|["']$/g, "");
}

async function sha256Hex12(value) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function requireEnv(env) {
  const missing = ["REGION_CODE", "ENDPOINT_BASE", "REGION_WORKER_SECRET"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(", ")}`);
}

async function loadTargets(env) {
  const sig = await hmacHex(cleanSecret(env), "targets");
  const res = await fetch(`${env.ENDPOINT_BASE}/api/public/regions/targets`, {
    headers: { "x-signature": sig },
  });
  if (!res.ok) throw new Error(`targets HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return Array.isArray(data?.targets) ? data.targets : [];
}

/** Faz apenas a checagem HTTP e devolve o resultado (sem enviar nada). */
async function checkOne(env, target) {
  const start = Date.now();
  let status = "unknown";
  let httpStatus = null;
  let error = null;
  let latency = null;

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch(`http://${target.host}:80/`, {
      method: "GET",
      redirect: "manual",
      signal: ctl.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: { "user-agent": "StreamMonitor-RegionWorker/1.0" },
    });
    clearTimeout(timer);
    latency = Date.now() - start;
    httpStatus = res.status;
    if (res.status >= 200 && res.status < 400) status = latency > 3000 ? "degraded" : "up";
    else if (res.status < 500) status = "degraded";
    else status = "down";
  } catch (e) {
    latency = Date.now() - start;
    status = "down";
    error = String(e?.message ?? e).slice(0, 200);
  }

  return {
    server_id: target.server_id,
    region_code: env.REGION_CODE,
    status,
    http_status: httpStatus,
    latency_ms: latency,
    error,
  };
}

async function runPool(items, size, fn) {
  const out = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function sendBatch(env, reports) {
  const body = JSON.stringify({ reports });
  const sig = await hmacHex(cleanSecret(env), body);
  const res = await fetch(`${env.ENDPOINT_BASE}/api/public/regions/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });
  if (!res.ok) throw new Error(`report HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function tick(env) {
  const all = await loadTargets(env);
  if (all.length === 0) return { region: env.REGION_CODE, targets: 0, reported: 0 };

  // Rotação: distribui os alvos entre execuções sucessivas (1 por minuto).
  const slots = Math.ceil(all.length / MAX_PER_RUN);
  const slot = Math.floor(Date.now() / 60_000) % slots;
  const batch = all.slice(slot * MAX_PER_RUN, slot * MAX_PER_RUN + MAX_PER_RUN);

  const reports = await runPool(batch, CONCURRENCY, (t) => checkOne(env, t));
  const resp = await sendBatch(env, reports);
  return {
    region: env.REGION_CODE,
    targets: all.length,
    checked: batch.length,
    slot: `${slot + 1}/${slots}`,
    reported: resp?.inserted ?? reports.length,
  };
}

export default {
  async scheduled(_event, env, ctx) {
    requireEnv(env);
    ctx.waitUntil(
      (async () => {
        try {
          console.log("tick", JSON.stringify(await tick(env)));
        } catch (e) {
          console.error("tick error", String(e?.message ?? e));
        }
      })(),
    );
  },

  // GET manual: abra a URL do worker.
  //   /            -> executa um ciclo de checagem
  //   /?diag=1     -> mostra a impressão digital do segredo do worker (não revela o valor)
  async fetch(req, env) {
    try {
      requireEnv(env);
      const url = new URL(req.url);
      if (url.searchParams.get("diag") === "1") {
        return Response.json({
          region: env.REGION_CODE,
          endpoint_base: env.ENDPOINT_BASE,
          secret_fingerprint: await sha256Hex12(cleanSecret(env)),
          hint: "Deve ser IGUAL ao secret_fingerprint de /api/public/regions/targets?diag=1",
        });
      }
      const summary = await tick(env);
      return Response.json({ ok: true, ...summary });
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
    }
  },
};
