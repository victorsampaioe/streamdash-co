
# StreamMonitor.site — Plano de Construção

App de monitoramento de infraestrutura, estilo Datadog/Uptime Kuma, com dashboard em tempo real, alertas multicanal e página pública de status.

## Escopo confirmado
- Nome do produto: **StreamMonitor** (streammonitor.site)
- Cadastro simplificado: **apenas nome, domínio/DNS e descrição opcional**
- Porta fixa em **80** para todos os monitoramentos (não exibida na UI)
- Todas as verificações HTTP usam automaticamente porta 80

## Stack e arquitetura
- Frontend: React 19 + TypeScript + TanStack Start (já configurado) + Tailwind v4 + shadcn/ui
- Backend: **Lovable Cloud** (Postgres gerenciado + Auth + Server Functions + Storage) — cobre o requisito de PostgreSQL, API REST equivalente via server functions, e histórico
- Cron de verificação: `pg_cron` chamando endpoint público `/api/public/cron/check` a cada 30s
- Notificações: Resend (email), Discord webhook, Telegram bot, webhooks genéricos
- Nota: itens como "Docker/Deploy AWS" ficam fora — Lovable Cloud já cuida do runtime gerenciado; posso documentar como exportar depois.

## Autenticação e permissões
- Email + senha, recuperação de senha via `/reset-password`
- Tabela `profiles` (nome, avatar) + `user_roles` com enum `admin | user`
- Função `has_role()` SECURITY DEFINER + RLS em todas as tabelas
- Painel `/admin` gated por `has_role(admin)` para gerenciar usuários e roles

## Schema do banco
```
profiles(id, full_name, avatar_url, created_at)
user_roles(id, user_id, role)          -- enum app_role
servers(id, owner_id, name, host, description, category, is_public, created_at)
check_config(server_id PK, interval_seconds default 30, failure_threshold default 3)
checks(id, server_id, checked_at, status, http_status, latency_ms,
       dns_resolved_ip, ssl_days_remaining, error)
incidents(id, server_id, started_at, ended_at, reason)
alert_channels(id, owner_id, kind [email|discord|telegram|webhook], target, enabled)
notifications_log(id, incident_id, channel_id, sent_at, ok, response)
```
Todas com RLS: dono vê o seu; admin vê tudo; `servers.is_public=true` fica legível por anon para a página de status.

## Monitoramento
- Server function `runCheck(serverId)`:
  1. Resolve DNS (via `dns.promises`)
  2. `fetch http://host:80/` com timeout, mede latência
  3. Se HTTPS disponível, checa cert SSL e dias restantes
  4. Grava linha em `checks`
  5. Se N falhas consecutivas ≥ `failure_threshold`, cria incident e dispara alertas
- Endpoint `/api/public/cron/check` (assinado por segredo) itera servidores devidos e roda em paralelo
- `pg_cron` job a cada 30s bate no endpoint

## Dashboard
- Rotas:
  - `/` landing pública com CTA
  - `/auth` login/registro + esqueci senha
  - `/reset-password`
  - `/app` dashboard (gated `_authenticated`)
  - `/app/servers/$id` histórico detalhado, gráficos (Recharts), últimos incidentes
  - `/app/servers/new` cadastro (apenas nome, host, descrição)
  - `/app/alerts` canais de alerta
  - `/app/admin` (gated admin) usuários + roles
  - `/status/$slug` página pública por servidor
- Cards Online/Offline com semáforo verde/amarelo/vermelho
- Gráfico de uptime 24h/7d/30d, latência ao longo do tempo
- Busca instantânea, filtros por categoria/status
- Realtime via Supabase Realtime subscription em `checks`
- Modo escuro/claro com toggle (persistido)
- Exportação CSV do histórico do servidor

## Alertas
- Canais configuráveis pelo usuário: email (Resend), Discord (webhook URL), Telegram (chat_id via bot compartilhado), webhook genérico
- Disparo após `failure_threshold` falhas seguidas; segundo disparo quando resolvido
- Segredos: `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`

## Design system
- Tema escuro-first, paleta observability: fundo `#0B0F17`, superfícies `#111827`, acento ciano `#22D3EE`, sucesso `#22C55E`, aviso `#F59E0B`, erro `#EF4444`
- Tipografia: JetBrains Mono para métricas, Inter para UI
- Tokens semânticos em `src/styles.css` (oklch), sem cores hardcoded nos componentes
- Componentes shadcn customizados: `StatusBadge`, `MetricCard`, `UptimeBar`, `LatencyChart`

## Entrega em fases (nesta ordem, tudo neste projeto)
1. Habilitar Lovable Cloud + migrations do schema + RLS + roles + seed admin trigger
2. Design system + shell (sidebar, header, dark/light toggle)
3. Auth (login, signup, reset) + rota `_authenticated`
4. CRUD de servidores (form minimalista: nome, host, descrição)
5. Motor de check + rota cron pública + pg_cron
6. Dashboard com cards, gráficos, realtime, filtros, CSV
7. Página de detalhe + página pública `/status/$slug`
8. Canais de alerta + envio (email/discord/telegram/webhook)
9. Painel admin (usuários + roles)
10. SEO (title/desc/OG), sitemap, robots

## Perguntas antes de começar
1. **Registro público liberado** ou apenas admin cria contas?
2. **Email** para notificações: uso o remetente de teste do Resend (`onboarding@resend.dev`) ou você tem domínio verificado? (posso trocar depois)
3. **Telegram**: prefere que cada usuário informe o próprio bot token, ou usamos um bot único compartilhado da plataforma?

Se quiser, respondo essas 3 rapidamente e já começo pela fase 1.
