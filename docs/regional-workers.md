# Workers regionais — Mapa de Falhas Global

O StreamMonitor mostra um Mapa Global por servidor com o status/latência
de cada região. Uma linha "origin" já é gerada pelo próprio backend a cada
verificação. Para preencher as demais regiões (São Paulo, Virgínia,
Frankfurt, Tóquio, etc.), rode um worker leve em uma VM/EC2 dentro de
cada região. Cada worker:

1. Lê a lista de servidores públicos ou os que você quer monitorar.
2. Faz um `fetch` HTTP no host, medindo latência.
3. Envia o resultado, assinado com HMAC-SHA256, ao endpoint público:

```
POST https://streammonitor.site/api/public/regions/report
Headers:
  content-type: application/json
  x-signature: <hex(HMAC_SHA256(REGION_WORKER_SECRET, rawBody))>
Body:
{
  "server_id": "<uuid do servidor>",
  "region_code": "sa-east-1",     // um dos códigos cadastrados em check_regions
  "status": "up" | "down" | "degraded" | "unknown",
  "http_status": 200,
  "latency_ms": 42,
  "error": null
}
```

O segredo compartilhado está em **Lovable Cloud → Secrets** como
`REGION_WORKER_SECRET`. Copie-o para o worker via variável de ambiente.
Rotacione com o botão “Update” nas Settings quando quiser.

## Worker mínimo (Node 20)

```js
// worker.js
import crypto from "node:crypto";

const SECRET = process.env.REGION_WORKER_SECRET;
const REGION = process.env.REGION_CODE;              // ex: sa-east-1
const ENDPOINT = "https://streammonitor.site/api/public/regions/report";
const TARGETS = JSON.parse(process.env.TARGETS_JSON); // [{ server_id, host }, ...]

async function checkOne(target) {
  const start = Date.now();
  let status = "unknown", httpStatus = null, error = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`http://${target.host}:80/`, { redirect: "manual", signal: ctl.signal });
    clearTimeout(t);
    httpStatus = res.status;
    status = res.status >= 200 && res.status < 400 ? "up" : res.status < 500 ? "degraded" : "down";
  } catch (e) { status = "down"; error = String(e?.message ?? e).slice(0, 200); }
  const body = JSON.stringify({
    server_id: target.server_id,
    region_code: REGION,
    status, http_status: httpStatus,
    latency_ms: Date.now() - start,
    error,
  });
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });
}

async function tick() { await Promise.allSettled(TARGETS.map(checkOne)); }
setInterval(tick, 30_000); tick();
```

Suba um desses por região (SP: `sa-east-1`, Virgínia: `us-east-1`,
Frankfurt: `eu-central-1`, Tóquio: `ap-northeast-1`). Um `t4g.nano`
com `pm2 start worker.js` já resolve.

## Novas regiões

Basta inserir uma linha em `check_regions` (via SQL/painel) com
`code`, `city`, `country`, `flag`, `latitude` e `longitude`. O mapa
e a lista aparecem automaticamente.
