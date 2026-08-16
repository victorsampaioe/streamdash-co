# Deploy do Stream Monitor — VPS AWS EC2 (Ubuntu 24.04 ARM64)

Núcleo oficial de produção: **https://core.streammonitor.site** → Caddy → `localhost:3000`.

## 1. Instalação

```bash
cd /opt
sudo git clone REPOSITORIO streammonitor
cd streammonitor
sudo cp .env.example .env
sudo nano .env            # preencha as chaves reais
sudo docker compose up -d --build
```

Verificar:

```bash
docker compose ps
docker compose logs -f app
curl -i http://127.0.0.1:3000/api/public/health
```

Resposta esperada: `{"status":"ok","service":"stream-monitor-core", Clique no botão "View Backend" (ou no ícone de banco de dados no menu lateral do Lovable). não estou achando}`.

## 2. Caddy

`/etc/caddy/Caddyfile`:

```caddy
core.streammonitor.site {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        health_uri /api/public/health
        health_interval 30s
        transport http {
            dial_timeout 5s
            response_header_timeout 60s
        }
    }
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Se der **502**: confirme `docker compose ps` (app `healthy`) e que a porta está publicada em `127.0.0.1:3000` (`ss -ltnp | grep 3000`).

## 3. Arquitetura em produção

| Serviço | Função |
|---|---|
| `app` | Aplicação TanStack Start (Nitro `node-server`) na porta 3000 |
| `scheduler` | Dispara `/api/public/cron/check` a cada `CRON_INTERVAL_SECONDS` (padrão 30s) |
| `digest` | Dispara `/api/public/cron/digest` de hora em hora (resumo Telegram) |

Todo o monitoramento (DNS, HTTP/SSL, Xtream/IPTV, conteúdos) passa a sair pelo **IP da EC2**, sem depender de ambiente compartilhado.

## 4. Estabilidade e anti-bloqueio

- Concorrência limitada + jitter (`MONITOR_CONCURRENCY`, `MONITOR_JITTER_MS`).
- Timeouts curtos (HTTP 8s, SSL 6s) e confirmação de queda por rajada antes de alertar.
- `restart: unless-stopped` + healthcheck do Docker (reinício automático 24/7).
- Logs rotacionados (10 MB × 5) e limite de memória de 1 GB.
- `ulimit nofile 65535` e DNS fixo (1.1.1.1 / 8.8.8.8) para muitas conexões simultâneas.
- Porta exposta apenas em `127.0.0.1` — somente o Caddy alcança a aplicação.

Ajuste conforme o tamanho da EC2: `MONITOR_CONCURRENCY=4` (t4g.micro) até `16` (2 vCPU+).

## 5. Operação

```bash
# atualizar para a última versão
cd /opt/streammonitor && sudo git pull && sudo docker compose up -d --build

# reiniciar / parar
sudo docker compose restart app
sudo docker compose down

# limpar imagens antigas
sudo docker image prune -f
```

## 6. Firewall

```bash
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

A porta 3000 **não** deve ser aberta externamente.

## Core AWS (motor de monitoramento)

O painel Lovable agora funciona apenas como frontend. Todas as verificações
(DNS, HTTP, IPTV, conteúdos), os alertas do Telegram e o scheduler são
executados pelo Core em `https://core.streammonitor.site`.

Variáveis:

- Painel (Lovable): `VITE_CORE_API_URL=https://core.streammonitor.site` e
  `CORE_API_URL=https://core.streammonitor.site` + `CRON_SECRET` (o mesmo da VPS).
- VPS (Core): `IS_CORE=true` (ou `PUBLIC_BASE_URL=https://core.streammonitor.site`),
  para o Core não chamar a si mesmo.

Endpoints do Core:

- `POST /api/public/core/task` — tarefas delegadas pelo painel
  (`check`, `dns`, `iptv-detect`, `iptv-validate`, `iptv-sync`, `iptv-ua-test`,
  `content-scan`, `telegram-broadcast`), autenticado por `x-cron-secret`.
- `POST /api/public/cron/check` e `/api/public/cron/digest` — ciclos agendados.

Se o Core ficar indisponível, o painel executa localmente como fallback.

## Banco de dados: sempre o Supabase original do Lovable

O Core na AWS **não** usa banco próprio. Ele conecta no mesmo Postgres do
projeto Lovable. No `.env` da VPS use exatamente:

```
SUPABASE_URL=https://yiwyfiaqehhmngqngxvx.supabase.co
SUPABASE_PUBLISHABLE_KEY=<chave publicável do projeto>
SUPABASE_SERVICE_ROLE_KEY=<chave de serviço do projeto>   # obrigatória
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=yiwyfiaqehhmngqngxvx
IS_CORE=true
CRON_SECRET=<mesmo valor do painel>
```

Não quero alterar documentação.

Quero alterar a configuração do projeto.

O Supabase usado pela aplicação está apontando para:

https://rbmrnqtkddvjpaznyvtk.supabase.co

Trocar para:

https://yiwyfiaqehhmngqngxvx.supabase.co

Atualize as variáveis de ambiente/configuração do Supabase da aplicação.

Troque também a anon key se necessário.

Depois teste se o site está lendo os dados do novo Supabase.

O motor de monitoramento (`servers`, `checks`, `dns_snapshots`, `iptv_*`,
`content_*`, `expiry_notices`, RPCs como `get_admin_stats`, `rollup_metrics`,
`purge_old_metrics`) roda com a chave de serviço, que ignora RLS — por isso
`SUPABASE_SERVICE_ROLE_KEY` é obrigatória. Sem ela os ciclos falhavam com
**HTTP 500**.

### Diagnóstico rápido na VPS

```bash
curl -s "http://127.0.0.1:3000/api/public/health?deep=1" | jq
```

Retorna quais variáveis faltam, se o banco responde e se as RPCs do
monitoramento estão acessíveis (nunca imprime o valor das chaves).

### Ciclo do scheduler

```bash
curl -s -X POST http://127.0.0.1:3000/api/public/cron/check \
  -H "x-cron-secret: $CRON_SECRET" | jq
```

Agora o endpoint nunca devolve 500: cada etapa é isolada e as falhas voltam
no campo `errors`, então o scheduler Docker não entra em loop de erro.

## 7. Atualizar o Worker para a versão atual do Core Stream

O protocolo de streaming tem versão (`CORE_STREAM_VERSION` em `src/lib/core-version.ts`).
O Worker responde essa versão em `/api/public/health` (`streamVersion`) e no header
`X-Core-Stream-Version` de `/api/public/core/stream`.

Se o header não vier, o Worker está **desatualizado** (é a causa do HTTP 400
"Missing parameters" no relay assinado).

```bash
ssh ubuntu@56.125.119.221
cd /opt/streammonitor
sudo git pull
sudo docker compose up -d --build
curl -s http://127.0.0.1:3000/api/public/health | jq
```

Esperado: `{"worker":true,"database":false,"hasSecret":true,"streamVersion":"..."}`.

### Validação real após o deploy

```bash
CRON_SECRET=<mesmo do painel> CORE_API_URL=https://core.streammonitor.site \
node scripts/verify-core-stream.mjs \
  "http://HOST/live/USER/PASS/<stream_id>.m3u8" \
  "http://HOST/movie/USER/PASS/<stream_id>.mp4" \
  "http://HOST/series/USER/PASS/<episode_id>.mp4"
```

Saída por item: `via / status / Content-Type / Range / tempo / worker / erro / resultado`.
Aceite: live → `200 application/vnd.apple.mpegurl` com segmentos; filme e episódio →
`206 video/mp4` com `Content-Range`.

### Diagnóstico no Worker (sem 400 genérico)

- `[CORE REQUEST] status= erro= payload_valido= assinatura=` — entrada, HMAC, exp.
- `[UPSTREAM IPTV] url= status= content-type= range= tempo= erro=` — saída para o IPTV.
- Headers de resposta: `X-Core-Error`, `X-Upstream-Status`, `X-Playback-Reason`.
