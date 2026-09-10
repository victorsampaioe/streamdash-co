# STREAM MONITOR API — auditoria e plano técnico

## Objetivo e princípio de implantação

Criar a **STREAM MONITOR API** como produto comercial separado e somente leitura sobre os dados já coletados. A implementação será aditiva: nenhuma rota atual será substituída, nenhuma consulta pública iniciará monitoramento, e o Core continuará sendo o executor stateless das sondas.

```text
App / site / bot / IA do cliente
              |
         /api/v1/*
              |
  Gateway da STREAM MONITOR API
  autenticação + tenant + scopes + quotas + logs
              |
 RPCs/consultas agregadas de leitura
              |
 Dados já produzidos pelo painel, jobs regionais e Core
```

No stack atual, “BFF / Edge Function” será implementado por **rotas de servidor TanStack**. Não serão criadas Supabase Edge Functions nem um segundo backend.

## 1. Auditoria da arquitetura atual

### Componentes relevantes

- O painel e a API rodam em TanStack Start; integrações HTTP externas já ficam em rotas de servidor.
- O Core AWS é um worker sem acesso direto ao banco. Recebe apenas tarefas assinadas e devolve resultados; o painel persiste.
- Os jobs atuais executam checks, rollups, Radar e performance. O job de performance está ativo a cada 10 minutos.
- Já existem primitivas reutilizáveis para rate limit persistente, nonces anti-replay, sanitização e auditoria.
- Já existem RPCs de ranking, performance, regiões, status público e agregações históricas.
- Existe um MCP atual com OAuth para funções do produto, mas ele é separado e não será alterado nesta iniciativa.

### Fontes que serão reutilizadas

- `servers`: estado atual, latência, Health Score, DNS, SSL e propriedade.
- `checks`, `checks_hourly`, `checks_daily`: status e latência; históricos usarão prioritariamente os rollups.
- `region_checks`, `region_checks_hourly`, `region_checks_daily`, `check_regions`: visão regional.
- `incidents`: incidentes de DNS e servidor, preservando a separação atual.
- `server_perf_runs`: API latency, TTFB, mediana e testes reais de abertura.
- `server_analysis`: análise técnica disponível, com projeção pública restrita.
- Tabelas de conteúdo/IPTV apenas para métricas agregadas autorizadas; catálogo e credenciais não serão expostos.
- `profiles`, `reseller_tree`, `user_roles`: resolução interna de conta, hierarquia e administração.
- `api_rate_limits`, `api_request_nonces`, `security_audit_log`: base a ser endurecida e reutilizada.
- RPCs existentes: ranking de performance, histórico de performance, séries regionais, vereditos regionais, Health/Content overview e funções de ownership.

### Serviços/rotas existentes reutilizáveis

- Agregação e mediana de performance.
- Máquina de estados que separa DNS de servidor e confirma offline por regiões/falhas consecutivas.
- Rollups horários/diários e retenção de métricas.
- Sanitização de logs e envelope seguro de erros.
- Fila com concorrência e jitter para tarefas internas.

As rotas atuais de Android, Core, cron, Telegram, pagamentos e streaming **não serão reutilizadas como API comercial**. Permanecerão isoladas no namespace atual.

## 2. Modelo de dados novo

Novas tabelas, todas com `GRANT`, RLS e políticas no mesmo migration:

1. `api_plans`: nome, preço informativo, limite mensal/minuto, burst, retenção, máximo de chaves/webhooks, histórico permitido, recursos e status. Valores editáveis pelo Admin.
2. `api_subscriptions`: conta proprietária, plano, status, validade, overrides de limites, requests extras e datas. Independente de `subscriptions` normal.
3. `api_keys`: assinatura, prefixo pesquisável, hash, nome, ambiente, status, expiração, último uso, rotação e quota individual opcional.
4. `api_key_scopes`: scopes permitidos por chave; catálogo fechado de scopes no backend.
5. `api_allowed_ips`: CIDR/IP autorizado por chave.
6. `api_allowed_origins`: origens CORS autorizadas por conta/chave.
7. `api_resource_ids`: mapeia UUID interno para IDs públicos opacos como `srv_*`, `inc_*`, sem alterar contratos internos.
8. `api_request_logs`: metadados mínimos de requisição, sem credenciais ou payload sensível.
9. `api_usage_daily`: agregados por conta, chave, endpoint, ambiente e dia.
10. `api_webhooks`: destino, eventos, status e hash/segredo criptografado para assinatura.
11. `api_webhook_events`: evento canônico imutável.
12. `api_webhook_deliveries`: tentativas, resposta truncada/sanitizada, próximo retry e status final.
13. `api_usage_alerts`: deduplicação dos alertas administrativos de 80%, 100%, abuso e falhas.

Não serão duplicadas tabelas de checks, incidentes, performance, regiões, catálogo ou Health Score.

## 3. Autenticação e armazenamento de chaves

- Formatos: `sm_live_<prefixo>_<segredo>` e `sm_test_<prefixo>_<segredo>`.
- O segredo terá alta entropia e será mostrado uma única vez.
- Banco guarda somente prefixo, últimos quatro caracteres e **HMAC-SHA-256** da chave completa com pepper exclusivo guardado nos secrets da aplicação.
- Lookup por prefixo indexado; validação final em tempo constante.
- Headers aceitos: `Authorization: Bearer ...` e `X-API-Key`.
- Se ambos vierem e divergirem, retornar 401.
- A autenticação produz contexto interno imutável: `subscription_id`, `account_id`, `key_id`, ambiente, scopes e limites.
- `account_id`, revenda ou owner enviados em URL/body nunca determinam acesso.
- Status suspenso/cancelado/expirado, chave revogada/inativa/expirada e plano incompatível bloqueiam antes da consulta.

## 4. Isolamento multi-tenant

- Toda leitura começa pelo `account_id` derivado da chave.
- Um único resolvedor server-side aplicará a hierarquia existente (`owner_account_id`/`reseller_tree`) e retornará o conjunto autorizado.
- A primeira versão usará uma política conservadora: conta própria e recursos explicitamente vinculados; nenhum acesso transversal implícito.
- Consultas por recurso combinarão `public_id` + ownership no mesmo predicado. Recurso de outro cliente responderá 404 para não confirmar existência.
- RLS protegerá tabelas de gestão da API para painel; rotas externas usarão funções server-side fechadas e projeções explícitas, nunca `select('*')`.
- Teste obrigatório A/B: chave A consultando servidor B deve retornar 404 e não gravar conteúdo de B no log.

## 5. Gateway, rate limit e padrão HTTP

Cada `/api/v1/*` passará pelo mesmo pipeline:

1. Gerar `req_*` e devolver `X-Request-ID`.
2. Aplicar limite de tamanho e timeout.
3. Autenticar chave e assinatura da API.
4. Validar status, ambiente e expiração.
5. Resolver tenant no servidor.
6. Exigir scope da rota.
7. Validar IP e origem quando configurados.
8. Aplicar limite mensal, por minuto, burst, chave, conta, IP e endpoint.
9. Validar parâmetros com Zod e allowlists de filtros/ordenação.
10. Executar consulta agregada e projetar DTO público.
11. Registrar métrica/log sanitizado e responder com headers de quota.

O contador atual de janela fixa será reutilizado estruturalmente, mas sua atualização será tornada atômica por função SQL para evitar corrida. Quota mensal virá de agregados diários mais contador do dia corrente.

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` em 429 e `X-Request-ID` sempre. Erros seguirão `{ error: { code, message, request_id } }`.

## 6. Endpoints versionados

### Fase de leitura operacional

- `GET /api/v1/health`
- `GET /api/v1/servers`
- `GET /api/v1/servers/{serverId}`
- `GET /api/v1/servers/{serverId}/status`
- `GET /api/v1/servers/{serverId}/performance`
- `GET /api/v1/servers/{serverId}/health`
- `GET /api/v1/servers/{serverId}/history`
- `GET /api/v1/monitoring/summary`
- `GET /api/v1/monitoring/status`
- `GET /api/v1/monitoring/performance`
- `GET /api/v1/monitoring/regions`
- `GET /api/v1/monitoring/health`

### Incidentes e analytics

- `GET /api/v1/incidents`
- `GET /api/v1/incidents/{incidentId}`
- `GET /api/v1/analytics/ranking`
- `GET /api/v1/analytics/best-server`
- `GET /api/v1/analytics/worst-server`
- `GET /api/v1/analytics/degraded`
- `GET /api/v1/analytics/anomalies`
- `GET /api/v1/analytics/latency-ranking`
- `GET /api/v1/analytics/health-ranking`
- `GET /api/v1/analytics/stability-ranking`
- `GET /api/v1/analytics/summary`

### Contexto para IA externa

- `GET /api/v1/ai/context`
- `GET /api/v1/ai/server/{serverId}`
- `GET /api/v1/ai/recommendations`
- `GET /api/v1/ai/anomalies`
- `GET /api/v1/ai/summary`
- `GET /api/v1/ai/performance`

Essas rotas só estruturam dados e regras determinísticas. Não chamarão OpenAI, Gemini, Claude ou outro provedor, nem gerarão custo de IA para o Stream Monitor.

Coleções usarão cursor opaco e limite máximo. Ordenação e filtros terão mapas fechados. Timestamps serão UTC ISO 8601. Métrica ausente será `null`/`unavailable`, nunca simulada.

## 7. Analytics, anomalias e cache

- Ranking e “melhor servidor” reutilizarão Health Score atual, mediana de performance, uptime dos rollups, estabilidade e erros recentes.
- Anomalias serão regras transparentes: desvio percentual contra baseline de 24h/7d, aumento de falhas, oscilação e deterioração relativa. Cada resultado indicará dados usados e período.
- Consultas históricas usarão `checks_hourly` até 24h/7d e `checks_daily` para 30d; nunca varrerão checks brutos indiscriminadamente.
- Resumos/rankings serão RPCs agregadas para evitar N+1.
- Cache curto por `account_id + ambiente + endpoint + filtros` (status 5–15s; summary 30s; ranking/analytics/AI context 60s). Nenhuma consulta dispara sondas ou chama o Core.
- Corrigir o N+1 já identificado na seleção de performance por uma consulta `DISTINCT ON`/lateral antes de expor o ranking comercial.

## 8. Webhooks

- Gestão pelo painel autenticado, não pela API read-only inicial; `webhooks:manage` fica preparado para fase posterior.
- Secret exibido uma vez e armazenado protegido; assinatura HMAC sobre `timestamp + '.' + corpo bruto`.
- Headers: evento, entrega, timestamp e assinatura versionada.
- Replay protection por `event_id`, timestamp e tolerância documentada.
- Retry: 1m, 5m, 15m e 1h, com lock/idempotência para evitar duplicação.
- Apenas HTTPS; bloqueio de localhost, IPs privados, metadata endpoints e redirects inseguros para prevenir SSRF.
- Resposta armazenada apenas truncada e sanitizada.

## 9. Painéis e documentação

- Cliente/revendedor: nova rota protegida **API & Integrações**, separada da assinatura normal, com plano, quota, gráfico, chaves, logs, erros, webhooks e histórico.
- Admin: área dedicada **Admin → API**, com ativação, suspensão, planos, overrides, scopes, chaves, IPs, consumo e observabilidade.
- Portal público `/developers` e `/developers/changelog`, com sidebar, exemplos e políticas provisórias claramente marcadas.
- OpenAPI 3 em `/api/openapi.json` e `/api/openapi.yaml`; interface interativa em `/developers/reference`.
- Sandbox usa somente dados controlados e chaves `sm_test_*`; nunca mistura dados reais sem autorização.
- O OpenAPI será a fonte dos contratos e ficará preparado para SDKs e futuro MCP.

## 10. Índices e retenção

Índices principais:

- chave: prefixo único, hash único, assinatura/status/expiração;
- tenant: `account_id`, plano/status, conta+ambiente;
- uso: conta+dia, chave+dia, endpoint+dia;
- logs: request_id único, conta+created_at, key+created_at, endpoint+created_at, status+created_at;
- webhooks: conta+status, evento+created_at, webhook+next_attempt_at, delivery_id único;
- IDs públicos: tipo+public_id único e conta+tipo+internal_id;
- fontes atuais: manter índices por `server_id + timestamp`; adicionar somente os comprovadamente ausentes por `EXPLAIN`.

Retenção inicial: logs detalhados 30 dias; agregados 12 meses; entregas detalhadas 30 dias; eventos concluídos 90 dias; nonces e rate buckets expirados removidos diariamente. Valores ficarão configuráveis.

## 11. Riscos e mitigação

- **Vazamento entre clientes:** gateway central, ownership no mesmo predicado, public IDs, 404 cross-tenant e testes A/B.
- **Vazamento de credenciais:** DTOs com seleção explícita; proibição de `host`, username, password, Core URL, secrets e payloads internos.
- **Sobrecarga:** rollups, RPCs agregadas, cache curto, paginação, limites rígidos e nenhum teste on-demand.
- **Corrida no rate limit:** contador atômico no banco.
- **Service-role amplo:** import dinâmico somente após autenticação; helpers obrigatórios e consultas tenant-scoped.
- **CORS:** sem `*`; server-to-server funciona sem CORS, navegadores dependem de allowlist registrada.
- **Webhooks/SSRF:** HTTPS, DNS/IP validation antes e depois de redirect, HMAC, timeout, payload pequeno e retry limitado.
- **Logs excessivos/PII:** IP hasheado por padrão, User-Agent truncado, sem body e sem chave completa.
- **Regressão:** namespace novo, migrations aditivas, flags de ativação por fase e nenhum redirecionamento das rotas existentes.
- **Linter atual:** há avisos preexistentes sobre funções `SECURITY DEFINER`; as novas funções terão grants mínimos e não ampliarão a superfície anônima.

## 12. Rollback

- Cada fase terá migration aditiva separada e reversível.
- Feature flag global desativa `/api/v1` com 503 sem afetar painel/Core.
- Planos e assinaturas começam inativos; nenhuma chave é criada automaticamente.
- Desativação de rotas não remove dados; jobs novos podem ser pausados isoladamente.
- Contratos existentes não serão alterados. Rollback de UI remove apenas links/rotas novas.
- Antes de cada fase: snapshot lógico das tabelas afetadas; depois: build, smoke tests, RLS, cross-tenant e regressão dos jobs atuais.

## 13. Funções que permanecerão intocadas

- Monitoramento DNS/HTTP, confirmação regional e backoff.
- Cálculo atual de Health Score.
- Jobs de checks, rollups, Radar, performance e notificações.
- Core task/stream/report e `CRON_SECRET`.
- Android Stream Play, sessões Android e descoberta Xtream.
- Web Player e proxy de mídia.
- Telegram, pagamentos, assinatura normal e créditos de revenda.
- MCP atual e arquivos auto-gerados.
- Credenciais IPTV e helpers de criptografia.

## 14. Execução em fases com validação

1. **Auditoria e arquitetura** — este documento; nenhuma alteração funcional.
2. **Banco da API** — planos, assinatura independente, chaves, scopes, IDs públicos, RLS e seeds dos quatro planos.
3. **Gateway** — autenticação, quota atômica, request ID, logs, CORS/IP e erros.
4. **Operacional** — servers, status, monitoring, health e performance.
5. **Histórico** — incidents, history, analytics e ranking.
6. **Inteligência estruturada** — anomalies, AI Context e recommendations sem provedor externo.
7. **Webhooks** — HMAC, proteção SSRF, fila, retry e entregas.
8. **Painel do cliente** — API & Integrações.
9. **Admin API** — planos, clientes, limites e observabilidade.
10. **Developers** — OpenAPI, referência interativa, exemplos, sandbox e changelog.

Após cada fase: build, testes unitários/integração, RLS, chave válida/inválida/revogada, suspensão, quotas, scopes, paginação, filtros, cross-tenant A/B, inspeção dos logs e smoke tests de monitoramento, Core, Android, Web Player, Radar, Telegram e cron. A fase seguinte só começa após a anterior passar.

## Critérios de aceite da primeira versão comercial

- Produto API independente dos planos normais.
- Chaves nunca persistidas em claro e exibidas uma única vez.
- Todas as rotas leem apenas dados previamente coletados.
- Nenhum UUID/host/credencial sensível aparece nos contratos públicos.
- Isolamento A/B comprovado por teste automatizado.
- Quotas mensais e por minuto configuráveis no Admin.
- OpenAPI corresponde aos endpoints reais.
- P95, P99, 4xx, 5xx e 429 disponíveis no Admin.
- Nenhuma regressão nos fluxos existentes.
