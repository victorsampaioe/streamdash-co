# Workers regionais — Mapa Global de Falhas

O StreamMonitor recebe verificações de **workers regionais** que rodam fora do
Lovable Cloud (que é uma edge única) e reportam status/latência por região.
O endpoint `/api/public/cron/check` continua alimentando a região `origin`;
para as regiões geográficas (SP, Ashburn, Frankfurt, Tóquio, …) você
precisa rodar 1 worker leve por região.

A opção recomendada é **Cloudflare Workers com Cron Triggers**: gratuito
até 100k requests/dia, roda de fato em cada colo (GRU/IAD/FRA/NRT) e usa
`fetch` nativo.

## Fluxo

```
Cloudflare Worker (por região)
   │  a cada 10s (cron)
   │
   ├─► GET  /api/public/regions/targets   (HMAC "targets")
   │       ↳ retorna [{ server_id, host }, ...] de assinantes ativos
   │
   └─► POST /api/public/regions/report    (HMAC do body)
           ↳ grava resultado, dispara alertas de transição
                     │
                     └─► Supabase Realtime → Dashboard atualiza sozinho
```

## Passo 1 — instalar wrangler e criar o projeto

```bash
npm create cloudflare@latest streammonitor-worker -- --type=hello-world --ts=false
cd streammonitor-worker
```

Sobrescreva `wrangler.toml` (um por região; duplique o arquivo):

```toml
name = "streammonitor-sao-paulo"   # ou -ashburn / -frankfurt / -tokyo
main = "src/index.js"
compatibility_date = "2025-01-01"

[vars]
REGION_CODE = "sa-east-1"          # sa-east-1 | us-east-1 | eu-central-1 | ap-northeast-1
ENDPOINT_BASE = "https://streammonitor.site"

[triggers]
crons = ["*/1 * * * *"]           # dispara 1x/min; dentro do handler fazemos 6 ciclos de 10s
```

Adicione o segredo compartilhado (o mesmo `REGION_WORKER_SECRET` do painel):

```bash
wrangler secret put REGION_WORKER_SECRET
```

## Passo 2 — código do worker

`src/index.js`:

```js
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadTargets(env) {
  const sig = await hmacHex(env.REGION_WORKER_SECRET, "targets");
  const r = await fetch(`${env.ENDPOINT_BASE}/api/public/regions/targets`, {
    headers: { "x-signature": sig },
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  const { targets } = await r.json();
  return targets;
}

async function checkOne(env, target) {
  const start = Date.now();
  let status = "unknown", httpStatus = null, error = null, latency = null;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`http://${target.host}:80/`, {
      redirect: "manual", signal: ctl.signal, cf: { cacheTtl: 0 },
    });
    clearTimeout(to);
    latency = Date.now() - start;
    httpStatus = res.status;
    if (res.status >= 200 && res.status < 400) status = latency > 3000 ? "degraded" : "up";
    else if (res.status < 500) status = "degraded";
    else status = "down";
  } catch (e) {
    status = "down";
    error = String(e?.message ?? e).slice(0, 200);
    latency = Date.now() - start;
  }
  const body = JSON.stringify({
    server_id: target.server_id,
    region_code: env.REGION_CODE,
    status, http_status: httpStatus, latency_ms: latency, error,
  });
  const sig = await hmacHex(env.REGION_WORKER_SECRET, body);
  await fetch(`${env.ENDPOINT_BASE}/api/public/regions/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });
}

async function tick(env) {
  const targets = await loadTargets(env);
  await Promise.allSettled(targets.map((t) => checkOne(env, t)));
}

export default {
  // Cron dispara 1x/min. Fazemos 6 ciclos de 10s para o requisito "a cada 10s".
  async scheduled(_event, env, ctx) {
    const runs = [tick(env)];
    for (let i = 1; i <= 5; i++) {
      runs.push(new Promise((r) => setTimeout(r, i * 10_000)).then(() => tick(env)));
    }
    ctx.waitUntil(Promise.allSettled(runs));
  },
  // GET manual para testar
  async fetch(_req, env) {
    await tick(env);
    return new Response("ok");
  },
};
```

## Passo 3 — deploy (1 por região)

Duplique o diretório do worker para cada região trocando `name` e
`REGION_CODE` no `wrangler.toml`:

| Região         | `REGION_CODE`     |
| -------------- | ----------------- |
| 🇧🇷 São Paulo   | `sa-east-1`       |
| 🇺🇸 Ashburn     | `us-east-1`       |
| 🇩🇪 Frankfurt   | `eu-central-1`    |
| 🇯🇵 Tóquio      | `ap-northeast-1`  |

Para cada um:

```bash
wrangler deploy
```

O dashboard mostrará automaticamente `4/4 Workers Online` quando os
quatro estiverem reportando (< 60s desde o último check).

## Novas regiões

Basta inserir uma linha em `check_regions` (`code`, `city`, `country`,
`flag`, `latitude`, `longitude`) e subir mais um worker com o novo
`REGION_CODE`. Mapa e lista aparecem sozinhos.
