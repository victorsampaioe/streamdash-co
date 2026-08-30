# Stream Monitor — Auditoria de Segurança da Plataforma

Escopo: backend (TanStack Start server routes + server functions), banco (Lovable Cloud/Postgres),
integrações externas (IPTV, TMDB, Telegram, Mercado Pago, Core AWS) e app Stream Play.
Nada de funcional foi removido; as mudanças são incrementais.

## 1. Superfície mapeada

**Rotas públicas (`/api/public/*`)**
`android/{login,associate,status,config,refresh,version}`, `tmdb/catalog`, `core/{stream,task,report,live-diag}`,
`cron/{check,digest,radar,notifications,iptv-notifications}`, `regions/{targets,report}`,
`telegram/webhook`, `webhooks/mercadopago`, `signup`, `radar`, `health`.

**Rotas autenticadas**: subárvore `_authenticated/` (gate gerenciado, `ssr:false`).
**Server functions**: `src/lib/*.functions.ts`, protegidas por `requireSupabaseAuth` + verificação de papel no backend.

## 2. Achados e status

| # | Sev. | Achado | Status |
|---|---|---|---|
| 1 | CRÍTICO | `server_id`/`reseller_id` controlados pelo cliente no associate Android | Corrigido (grants de resolução; `reseller_id` derivado de `servers.owner_id`) |
| 2 | ALTO | Endpoints Android sem rate limit | Corrigido (`api_rate_limits`) |
| 3 | ALTO | Credenciais IPTV enviadas em toda chamada, sem sessão | Mitigado (sessões emitidas; obrigatoriedade aguarda novo APK) |
| 4 | ALTO | Sem anti-replay | Corrigido (`api_request_nonces`, opcional até o novo APK) |
| 5 | ALTO | Chave TMDB tende a vazar em app cliente | Corrigido (BFF `/api/public/tmdb/catalog` com cache) |
| 6 | ALTO | Atualização de APK sem verificação de integridade | Corrigido (`app_releases` + SHA-256 calculado no servidor + trigger HTTPS) |
| 7 | ALTO | Requisições de saída para hosts arbitrários (SSRF) | Mitigado (`ssrf-guard.ts` bloqueia loopback, redes privadas, link-local, CGNAT, metadata cloud) |
| 8 | MÉDIO | `select *` e vazamento de campos internos em `/config` | Corrigido (projeção explícita) |
| 9 | MÉDIO | Logs com usuário/senha/token em claro | Corrigido (`sanitizeForLog` + `safeLog`) |
| 10 | MÉDIO | Erros sem contrato estável | Corrigido (envelope `{ok, code, message, error}`) |
| 11 | MÉDIO | Ausência de trilha de auditoria de ações sensíveis | Corrigido (`security_audit_log`) |
| 12 | MÉDIO | Flood de cadastros/bots | Corrigido em ciclo anterior (rate limit, Turnstile, honeypot, idempotência) |
| 13 | BAIXO | `core/stream.ts` com `Access-Control-Allow-Origin: *` | Aceito conscientemente: player white-label roda em domínios de revenda variáveis; a rota é somente leitura de mídia, sem cookies e com URL assinada por HMAC de curta duração |
| 14 | INFO | Tabelas de infraestrutura com RLS ligada e sem política | Intencional: acesso somente por `service_role`; nenhuma leitura via Data API |

## 3. Autorização

- Papéis continuam em `user_roles` + `has_role()` (SECURITY DEFINER). Nenhum papel em `profiles`.
- Toda ação administrativa nova (`app_releases`) valida `has_role(admin)` **no backend**, nunca pela UI.
- Endpoints públicos não retornam PII: `/status` devolve apenas estado/latência; `/config` apenas branding.

## 4. Camadas de rede e navegador

- `src/server.ts` já aplica HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, COOP e CSP (com `blob:` para mídia/worker do player).
- CORS: nenhum endpoint novo é cross-origin; apenas `core/stream.ts` mantém wildcard (item 13).
- Uploads/URLs externas: apenas HTTPS pública validada para logo de revenda e APK.

## 5. Integrações externas

| Integração | Proteção |
|---|---|
| TMDB | Chave apenas no servidor; BFF com cache e rate limit |
| Servidores IPTV | Guard de SSRF; HTTP legado permitido apenas para destinos públicos |
| Core AWS | HMAC + `CRON_SECRET` (inalterado) |
| Mercado Pago | Webhook com verificação e conciliação (inalterado) |
| Telegram | Deduplicação e envio somente para eventos válidos (inalterado) |

## 6. Testes executados

- Payload inválido → `400 invalid_payload`.
- Excesso de tentativas de login → `429 rate_limited` com `retry_after`.
- Associate com `server_id` não ofertado → `403 forbidden`.
- Associate repetindo `request_id` → `409 replay_detected`.
- Refresh reutilizado após rotação → `401 unauthorized`.
- `/status` e `/config` com UUID inválido → `400`.
- Versão com URL HTTP → rejeitada (trigger + guard).
- Fluxos legados (`resolve_client` → `associate` → `status` → `config`) mantidos com os mesmos campos.

## 7. Riscos residuais aceitos

1. Rate limit falha aberto quando o banco está indisponível (prioriza disponibilidade do monitoramento).
2. Credenciais IPTV do cliente ainda são armazenadas em `android_client_associations` para o login rápido
   do APK atual; a migração para hash/sessão depende da próxima versão do app.
3. Bearer ainda não é obrigatório nos endpoints Android (compatibilidade).
4. CORS aberto em `core/stream.ts` (item 13).

## 8. Próximos passos recomendados

1. Publicar o novo Stream Play e então exigir Bearer + `resolution_token` + `request_id`.
2. Migrar `android_client_associations` para senha criptografada (`crypto.server.ts` já existe) ou apenas hash.
3. Restringir CORS de `core/stream.ts` a uma allowlist de domínios de revenda.
4. Job de limpeza periódica de `api_rate_limits`, `api_request_nonces`, `android_sessions` e `tmdb_cache` expirados.
