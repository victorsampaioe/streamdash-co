# Auditoria + Endurecimento de Segurança — Stream Monitor (backend completo)

Escopo grande demais para uma única entrega segura. Proposta: executar em 5 fases incrementais, sem quebrar nada em produção. Cada fase termina com build verde e documentação atualizada.

## Fase 1 — Auditoria e mapeamento (sem alterar comportamento)
- Inventário de superfície: todas as rotas `/api/public/*`, server functions (`*.functions.ts`), rotas Core, webhooks, cron, MCP, storage e chamadas diretas ao banco pelo navegador.
- Varredura de secrets no bundle cliente (service_role, TMDB, CRON_SECRET, credenciais IPTV, IPs internos).
- Inventário de RLS: todas as tabelas, políticas por operação, tabelas sem política, GRANTs indevidos a `anon`.
- Contratos atuais dos 4 endpoints Android (request/response reais).
- Entrega: `STREAM_MONITOR_FULL_SECURITY_AUDIT.md` com achados classificados em CRÍTICO/ALTO/MÉDIO/BAIXO.

## Fase 2 — Endpoints Android (compatível com o APK atual)
- Rate limit por IP + device_id + hash do usuário, com limites distintos por endpoint (login/associate mais restritos; status/config com cache).
- Brute force no login: backoff progressivo, mensagem genérica, sem enumeração de usuário, sem log de senha.
- `/associate` seguro: validar servidor existente/autorizado, exigir que o `server_id` tenha vindo dos `candidates` daquele login (nonce de resolução com expiração curta), impedir associação a outro revendedor.
- Anti-replay: `request_id`/nonce com expiração para associate e operações sensíveis.
- `candidates`, `status` e `config` reduzidos ao mínimo público necessário, formato estável.
- Respostas de erro padronizadas `{ ok, code, message }`, sem detalhe interno; sanitização automática de logs.
- Compatibilidade: campos antigos continuam presentes; novos campos apenas adicionados.

## Fase 3 — Sessão de dispositivo (aditiva, sem exigir do APK)
- Tabela `android_devices` + `android_sessions`: access token curto (assinado server-side) e refresh com rotação.
- Claims: cliente (hash), reseller_id, server_id, device_id, permissões, expiração. Nunca senha IPTV, nunca segredo global no APK.
- Login passa a retornar `session` além do contrato atual. Endpoints aceitam token OU o fluxo antigo, até o APK novo sair.

## Fase 4 — Plataforma web (site, painéis, Core, Supabase)
- Autorização server-side em toda função administrativa (verificação de papel no backend, nunca só na UI).
- SSRF: validador central para hosts fornecidos por usuário (bloqueio de loopback, redes privadas, metadata cloud, portas internas) aplicado em monitoramento, diagnóstico, DNS, Radar e proxy Core — com allowlist para IPTV legítimo.
- CORS: remover `*` de endpoints sensíveis; manter apenas onde necessário para o player.
- Headers: HSTS, CSP revisada, X-Content-Type-Options, Referrer-Policy, frame-ancestors, Permissions-Policy.
- Rate limit em cadastro, recuperação de senha, buscas, Radar, relatórios e uploads.
- XSS: renderização como texto de nomes/branding/mensagens; validação de URL em logo/background.
- Correções de RLS/GRANT identificadas na Fase 1, uma migration por bloco, com rollback documentado.
- Audit log de ações críticas (créditos, ativação/revogação, permissões, exclusões, publicação de versão).

## Fase 5 — TMDB proxy + versões do Stream Play
- BFF `/api/public/tmdb/*` com chave só no servidor, cache em banco/edge e rate limit; contrato documentado para o Android migrar depois.
- Tabela `app_releases` (versionCode, versionName, minimum, recommended, mandatory, message, update_url HTTPS, sha256, status, datas) + painel Admin em Stream Play → Versões.
- Upload de APK com SHA-256 calculado no backend, URL sempre HTTPS de origem controlada; sem chave de assinatura armazenada (apenas fingerprint público opcional).
- Endpoint público de versão com cache e degradação graciosa.

## Testes
Suíte de testes de segurança cobrindo: login válido/inválido, brute force, server_id e reseller_id manipulados, associate repetido, replay, token expirado/adulterado, JSON inválido, payload gigante, acesso admin sem permissão, hash de APK inválido e abuso do proxy TMDB.

## Entregas de documentação
- `STREAM_MONITOR_FULL_SECURITY_AUDIT.md` (visão completa, por severidade e status).
- `STREAM_PLAY_BACKEND_SECURITY.md` (contratos antigos vs novos, exemplos JSON reais, o que o Android precisa mudar, o que ficou desativado por compatibilidade).

## Observação
Nada é removido nesta sequência: `resolve_client`, `associate`, `status`, `config`, monitoramento, Radar, alertas, player e revendedores continuam funcionando com os contratos atuais durante todas as fases.
