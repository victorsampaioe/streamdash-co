## Roadmap em fases — Mapa de Falhas + Utilidades

Vamos entregar em 4 fases. Cada fase é um deploy funcional; você aprova e passo para a próxima.

---

### Fase 1 — Mapa de Falhas em Tempo Real (o diferencial)

**Backend**
- Nova tabela `check_regions` (código, nome, cidade, país, lat/lng, ativo).
- Nova tabela `region_checks` (server_id, region_code, status, latency_ms, http_status, error, checked_at) com índice em (server_id, checked_at desc).
- Seed inicial das regiões: `sa-east-1` São Paulo 🇧🇷, `us-east-1` Virgínia 🇺🇸, `eu-central-1` Frankfurt 🇩🇪, `ap-northeast-1` Tóquio 🇯🇵. Fácil adicionar Fortaleza/Lisboa/Miami depois.
- Server route pública `/api/public/regions/report` — endpoint que os workers regionais chamam com HMAC (`REGION_WORKER_SECRET`) para gravar resultados. Assim você pluga workers reais em AWS quando quiser, um por região.
- Fallback interno: o cron atual (`runDueChecks`) faz a checagem "origem" (região do servidor Lovable) e grava com `region_code = 'origin'`. Enquanto você não subir os workers AWS, marco as demais regiões como *aguardando worker* (sem simular dado falso — respeita a proposta séria de monitoramento).
- RLS: leitura pública para servidores marcados `is_public`; leitura autenticada só do dono; escrita só via endpoint HMAC.

**Frontend**
- Página `/app/servers/$id` ganha aba **Mapa Global** com:
  - Mapa mundi SVG (D3 world-atlas leve, sem chave de API) com pontos coloridos por região.
  - Lista lateral: bandeira, cidade, status, latência, "há X segundos".
  - Auto-refresh a cada 10s via react-query.
- Página pública `/status/$slug` também exibe o mapa.
- Componente reutilizável `<GlobalCheckMap />`.

**Docs para você**
- README curto `docs/regional-workers.md` explicando como subir um worker Node em cada EC2 (SP/Virgínia/Frankfurt/Tóquio) que faz `fetch` no host e envia POST assinado. ~30 linhas de código por worker.

---

### Fase 2 — Hub de Utilidades client-side (rápido, sem backend)

Rota `/tools` com sidebar categorizada. Todas rodam 100% no browser:

- **Geradores:** QR Code (`qrcode`), senha forte, UUID v4/v7, timestamp ↔ data (todos os fusos).
- **Encoding/Hash:** Base64 encode/decode, MD5, SHA-1, SHA-256, SHA-512 (Web Crypto API).
- **JSON:** formatador, minificador, validador com apontamento de erro.

Cada ferramenta é um componente isolado em `src/routes/_authenticated/app.tools.*.tsx`, compartilhando um `<ToolShell>` reutilizável (título, descrição, input, output, botão copiar).

---

### Fase 3 — Ferramentas de Sites/Domínios/Segurança (backend leve)

Server functions autenticadas (com `PremiumGate` opcional):

- **Sites:** tempo de resposta, screenshot (via API externa tipo `s.wordpress.com/mshots` — grátis), histórico de uptime (já temos), histórico DNS (armazenar snapshots diários).
- **Domínios:** WHOIS + data de expiração + disponibilidade (via `whois` npm ou API RDAP oficial IANA — sem chave).
- **Segurança:** validador SSL (já temos parte), scan de headers (`fetch` + análise de `strict-transport-security`, `content-security-policy`, etc.), detector Cloudflare/CDN (via headers `server`, `cf-ray`, `x-served-by`), blacklist DNSBL (query DNS a Spamhaus/Barracuda), SPF/DKIM/DMARC (query TXT).

---

### Fase 4 — Ferramentas de Rede pesadas

Precisam do runtime Node no server (nem tudo roda no Worker Cloudflare). Vou avaliar caso a caso; algumas exigem worker AWS dedicado:

- DNS lookup, Reverse DNS, ASN, IP info, Geolocalização IP (via `ipapi.co` ou dataset MaxMind), detectar IPv4/IPv6 → viáveis no server atual.
- Ping, Traceroute, port scan, MTU, BGP → exigem raw sockets → rodam nos workers AWS regionais criados na Fase 1 (mesma infra).

---

### Detalhes técnicos importantes

- **Sem simular dados falsos** no Mapa: enquanto workers AWS não existem, as regiões extra ficam com status `pending` e badge "Aguardando worker". Isso mantém credibilidade do produto.
- **Escala:** as tabelas `region_checks` recebem alto volume — configurar retenção (deletar checks > 30 dias) via cron.
- **Mapa:** SVG estático + `topojson` (~100kb gz) — não precisa Google Maps/Mapbox nem chave.
- **Reutilização:** `<StatusDot>`, `<UptimeSparkline>`, `<PremiumGate>` já existem — reaproveitar em tudo.

---

### O que faço agora se aprovar

**Fase 1 completa** (mapa + tabelas + endpoint HMAC + doc para os workers AWS). Ao concluir, te aviso e você decide se seguimos para Fase 2 (utilidades) ou se quer primeiro subir os workers AWS.