/**
 * StreamMonitor — Worker regional (Cloudflare)
 * Cole este arquivo inteiro no editor da Cloudflare (Workers > Quick Edit).
 *
 * Variáveis (Settings > Variables):
 *   REGION_CODE           = sa-east-1 | us-east-1 | eu-central-1 | ap-northeast-1
 *   ENDPOINT_BASE         = https://streammonitor.site
 *   REGION_WORKER_SECRET  = (Secret / Encrypt) mesmo valor salvo no painel
 *
 * Cron Trigger (Settings > Triggers):  */1 * * * *
 */

const TIMEOUT_MS = 8000;
const CYCLES = 6;          // 6 ciclos de 10s dentro de 1 minuto
const CYCLE_GAP_MS = 10_000;

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
  const sig = await hmacHex(env.REGION_WORKER_SECRET, "targets");
  const res = await fetch(`${env.ENDPOINT_BASE}/api/public/regions/targets`, {
    headers: { "x-signature": sig },
  });
  if (!res.ok) throw new Error(`targets HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return Array.isArray(data?.targets) ? data.targets : [];
}

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

  const body = JSON.stringify({
    server_id: target.server_id,
    region_code: env.REGION_CODE,
    status,
    http_status: httpStatus,
    latency_ms: latency,
    error,
  });
  const sig = await hmacHex(env.REGION_WORKER_SECRET, body);
  const res = await fetch(`${env.ENDPOINT_BASE}/api/public/regions/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });
  if (!res.ok) throw new Error(`report HTTP ${res.status}`);
  return { host: target.host, status, latency };
}

async function tick(env) {
  const targets = await loadTargets(env);
  const results = await Promise.allSettled(targets.map((t) => checkOne(env, t)));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  return { region: env.REGION_CODE, targets: targets.length, reported: ok };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  // Cron dispara 1x/min; rodamos 6 ciclos espaçados de 10s.
  async scheduled(_event, env, ctx) {
    requireEnv(env);
    ctx.waitUntil(
      (async () => {
        for (let i = 0; i < CYCLES; i++) {
          try {
            const summary = await tick(env);
            console.log("tick", i, JSON.stringify(summary));
          } catch (e) {
            console.error("tick error", i, String(e?.message ?? e));
          }
          if (i < CYCLES - 1) await sleep(CYCLE_GAP_MS);
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

