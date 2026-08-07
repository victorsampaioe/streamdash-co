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

Resposta esperada: `{"status":"ok","service":"stream-monitor-core", ...}`.

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
