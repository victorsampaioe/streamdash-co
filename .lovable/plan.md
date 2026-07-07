## Roadmap ampliado — Radar Brasil + Detector + Colaborativo + Clima

Atualizando o plano geral. Novas fases entre a 1 (já entregue) e as antigas 2-4:

---

### Fase 1.5 — 📡 Radar Brasil (dashboard público)

**Rota pública** `/radar` (SSR, com metadata SEO, sem login).

**Cards do painel**
- 🚨 **Serviços com incidentes**: agregador de status oficiais em tempo real:
  - AWS Health RSS (`status.aws.amazon.com/rss/all.rss`)
  - Cloudflare Status API (`www.cloudflarestatus.com/api/v2/summary.json`)
  - GitHub Status (`www.githubstatus.com/api/v2/summary.json`)
  - Discord (`discordstatus.com/api/v2/summary.json`)
  - Microsoft 365 (RSS público)
  - Google Workspace (RSS)
  - WhatsApp/Meta (`metastatus.com/api/v2/summary.json`)
  - Pix/Banco Central (página de status pública quando houver JSON)
  Todos consumidos via server function com cache de 60s. Sem chave.
- 🔥 **Domínios monitorados com mais instabilidade (24h)**: agrega `checks` da base — top 10 servidores com maior taxa de `down/degraded`. Anonimizado (só quem marcou `is_public=true` aparece com nome; demais entram como "servidor privado").
- 📡 **Latência média por região**: agrega `region_checks` das últimas 24h agrupado por `region_code`.
- 📊 **Estatísticas 24h**: total de checks, uptime médio global, incidentes abertos vs resolvidos.
- 🌎 **Mapa de calor Brasil**: SVG estático do BR (topojson leve) colorido por estado com base na % de sucesso dos checks originados/reportados de cada UF. Sem UF suficiente ainda? Mostra badge "aguardando dados".
- 🌐 **Provedores com mais reclamações**: começa vazio; alimentado pela Fase 1.7 (relatos). Enquanto não há dados, mostra card explicativo "Ainda coletando".

**Backend**
- Server function `getRadarSnapshot()` que consolida tudo (cache 60s por chave).
- Endpoint público `/api/public/radar` retornando JSON (para embutir em outros sites — bônus).

**Retenção/performance**
- Materialized view opcional só se dados crescerem muito. MVP: agregações on-the-fly com `count/avg` limitados a 24h.

---

### Fase 1.6 — 🚨 Detector de Bloqueios

**Rota pública** `/detector` (login opcional; sem login, limita a 5 checks/dia por IP).

**Como funciona**
- Usuário digita um domínio.
- Server function `checkBlockade({ host })` dispara em paralelo:
  1. **DNS público**: resolve `host` via Google DNS (8.8.8.8), Cloudflare (1.1.1.1), OpenDNS, Quad9. Se resolvedores retornam IPs diferentes ou NXDOMAIN em alguns → *bloqueio DNS provável*.
  2. **HTTP direto**: tenta conectar. Se DNS resolve mas TCP falha → *bloqueio de firewall*.
  3. **Geo**: pede aos workers regionais AWS (mesma infra da Fase 1) para tentarem o host — se falha só em uma região, é *bloqueio geográfico*.
- Resultado em tabela: DNS resolver × status; região × status; verdict (`OK`, `DNS bloqueado`, `Firewall`, `Geo-bloqueio`, `Inacessível global`).

**Cache**: 5min por (host, sessão) para evitar abuso.

---

### Fase 1.7 — 🤝 Diagnóstico Colaborativo

**Ideia**: qualquer visitante pode reportar problema com um serviço/provedor a partir da localização detectada.

**Backend**
- Tabela `user_reports` (id, host_or_service, provider_hint, city, state, country, ip_hash, user_agent_hash, created_at). `ip_hash` = SHA-256 de IP + salt diário para agrupar sem armazenar IP.
- Server route `POST /api/public/reports` — rate-limit 3 relatos/hora por ip_hash. Geolocalização via header do Cloudflare (`cf-ipcountry`, `cf-ipcity`) quando disponível, senão IP→geo via `ipapi.co` (grátis, sem chave até certo limite) com fallback opcional.
- Server function `getIncidentClusters()` que detecta padrões: `>= 20 relatos do mesmo (provider, city) em 10min` → gera "incidente colaborativo" e aparece no Radar.

**UI**
- Botão "Relatar problema" flutuante em `/radar` e páginas de status.
- Modal: "Que serviço está com problema? Sua cidade?" (autopreenche via geo).
- Painel "Relatos ao vivo (últimos 10 min)" no Radar.

**Privacidade**
- Documentado que só armazenamos hash de IP com salt rotacionado diariamente. Sem cookies rastreadores.

---

### Fase 1.8 — 📶 Clima da Internet

**Rota** `/clima` (também dentro de `/radar` como widget).

**Como funciona**
- Detecta cidade do visitante (geo do Cloudflare / ipapi).
- Agrega dados dos últimos 60min para aquela cidade + provider (quando detectado via ASN):
  - `checks` regionais + `user_reports` da região.
  - Uptime, latência média, número de relatos.
- Classifica em 5 estados: ☀️ Excelente · 🌤️ Bom · ⛅ Regular · 🌧️ Instável · ⛈️ Crítico.
- Mostra card:
  ```
  Fortaleza — Brisanet
  ⛈️ Instabilidade
  Latência média: 340ms (↑)
  Uptime 1h: 82%
  Relatos: 47 nos últimos 30min
  ```

**Reutiliza** o cluster detector da Fase 1.7.

---

### Ordem de entrega e dependências

```text
Fase 1.5 (Radar) ─── independente, entrega solo, gera SEO
        │
Fase 1.6 (Detector) ── depende da infra HMAC dos workers regionais (já pronta)
        │
Fase 1.7 (Colaborativo) ── independente; alimenta Radar depois
        │
Fase 1.8 (Clima) ── consome 1.5 + 1.7 (precisa das duas para valer a pena)
```

Depois seguem as fases originais: 2 (utilidades /tools), 3 (sites/domínio/segurança), 4 (rede pesada).

---

### O que faço agora

Implemento **Fase 1.5 completa** (Radar Brasil):
- Tabela agregadora leve se precisar; caso contrário só server functions.
- Rota `/radar` + endpoint público JSON.
- Todos os cards, com fallbacks honestos quando ainda não há dados.
- Nada simulado.

Ao terminar, te aviso e sigo para 1.6.