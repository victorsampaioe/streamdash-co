# Stream Monitor — Plano de confiabilidade das verificações e alertas
Atualização: 18/11/2026 (horário de Fortaleza). Documento operacional com etapas verificáveis.

## Objetivos (não são garantias de 100% de disponibilidade)
- Ninguém deve visualizar **Online** quando uma verificação HTTP está atrasada (> 15 minutos).
- Notificações não devem repetir o mesmo evento para o mesmo destinatário durante um incidente aberto.
- Um servidor só deve receber **Offline confirmado** após evidência suficiente; não confundir erro isolado do observador com queda no destino.
- Separar saúde do Worker/Cloudflare, DNS, HTTP, login Xtream, reprodução e aplicativos parceiros.
- Plataforma sem dependência da antiga Core AWS. Cloudflare coleta/probe; processamento autenticado grava no banco vigente até migração validada.
- Priorizar queda real e retorno real; preservar histórico, crédito e permissão do dono.

## Arquitetura corrente verificada
1. Worker `streammonitor-regional-edge` executa probes HTTP periódicos (30 alvos/minuto rotativos), assina as respostas e publica em `region_checks`.
2. Banco reconcilia `cf-edge` para `servers` usando `maintenance.reconcile_cf_http()` a cada minuto via `pg_cron`.
3. `current_status` e `last_checked_at` são projeções derivadas; a UI não deve interpretar dados antigos como confirmação atual.
4. `incidents` mantém o incidente aberto por (servidor, tipo) com índice único; `notifications_log` e `telegram_outbox` guardam entrega e idempotência.
5. DNS roda separadamente na Cloudflare. O banco atual ainda é do projeto Lovable; migração para D1/Queues é etapa futura, **não concluída**.

## Etapa 0 — contenção de alarmes falsos (aplicada)
- [x] Substituir o antigo core AWS nas checagens automáticas de HTTP.
- [x] Exibir disponibilidade **não confirmada** após 15 min sem novo HTTP.
- [x] Reconciliação periódica de respostas Cloudflare com o banco.
- [x] Offline requer três falhas consecutivas na fonte atual; a recuperação requer duas respostas positivas após incidente.
- [x] Separar coleta de relatórios brutos da notificação para Cloudflare; o usuário só recebe eventos confirmados.
- [x] Retentar falhas de entrega sem marcar mensagens enfileiradas como entregues.
- [ ] Executar testes ponta a ponta em servidores de teste (up, down, timeout, login bloqueado, retomada) com evidências de entrega única por chat.

## Etapa 1 — precisão e estabilidade (prioridade máxima)
- Adicionar segunda sonda **independente de rede/região**, com identidade criptográfica própria. Workers não garantem por si só a região física; não apresentar duas execuções no mesmo provedor como regiões independentes.
- Regras: três amostras ruins seguidas e segunda região corroborando a falha → Offline confirmado; uma única região ruim → Instável; ausência de respostas do observador → Sem dados, nunca Offline.
- Recuperação: duas amostras saudáveis consecutivas e/ou segunda região, sem fechar o incidente por um único HTTP 200.
- Categorizar falhas: DNS NXDOMAIN/timeout, conexão HTTP, WAF/401/403/404, status 5xx, Xtream login, mídia HLS. HTTP 200 sem login/stream funcionando não significa IPTV OK.
- Colocar tolerância a oscilação/histerese, janela de 10 min para vários servidores com mesma causa, desacoplar estado operacional de evento de notificação.
- Verificar assinatura, timestamp, ownership, número máximo de alvos, bloqueio SSRF e unicidade de relatório antes de persistir.

## Etapa 2 — notificações sem ruído
- Chave única: `incident_type:server_id:incident_id:event:channel_id`; bloquear reivindicação concorrente via transação/unique index.
- No máximo uma mensagem de Offline e uma de Recuperação por incidente e destinatário; mensagens pendentes reentregues com backoff/limite, sem duplicar envio.
- Não publicar recuperação se não houve incidente aberto nem se o último estado não for confirmado.
- Aplicar agrupamento em falhas maciças: um resumo a cada 10 min, com contador e link para o painel, sem dezenas de avisos repetidos.
- Distintos: alerta individual por servidor, comunicado institucional único por campanha, alertas de alteração de catálogo opt-in.
- Registrar `queued`, `sent`, `failed`, `dead`, motivo e latência, sem credenciais nem tokens em logs.
- Guardrails e testes sob concorrência simulada/telegram 429 para provar entrega única.

## Etapa 3 — Cloudflare nativa e econômica
- Cloudflare Workers: sondas isoladas e filas assíncronas com limites de concorrência, timeout e circuit breaker.
- Cloudflare Queues: backlog/reentrega dos reports e Telegram. Usar Dead Letter Queue (DLQ) e retenção curta.
- D1: resultados derivados e controles de heartbeat **após** projeto piloto de migração. Manter origem atual como fonte única até comparação total de RLS, usuários, pagamentos e histórico; não migrar credenciais sensíveis para D1 antes de validação rigorosa.
- Monitorar custo por requisição, subrequests, erro 429/5xx, consumo CPU, disponibilidade da fila e último heartbeat.

## Painel de auditoria e metas iniciais
- Cobertura fresca (>95% dos servidores ativos com HTTP <15 min), objetivo estendido 99%.
- Taxa de falsos positivos de Offline/Recuperação baseada em amostra revisada semanalmente; meta inicial <1% com evidências.
- 0 mensagens repetidas do mesmo incidente para o mesmo chat.
- 95% dos incidentes confirmados enviados dentro de 2 minutos após confirmação (respeitando limite do Telegram).
- Indicadores separados: servidores online, instáveis, offline confirmados, sem dados, DNS offline e saúde do monitoramento.
- Exibir fila de notificações (pendente/enviado/falha final), idade do último probe, last error, próxima verificação.

## Testes de aceitação antes de ativar cada fase
1. Worker saudável + servidor offline → queda confirmada após os limiares.
2. Worker indisponível + servidor possivelmente saudável → **Sem dados**, nenhum alerta Offline.
3. DNS responde mas Xtream falha → DNS online e IPTV falhando, explicitamente separados.
4. Servidor oscila (up/down/up) → debounce e sem flooding.
5. Doze servidores caem ao mesmo tempo → resumo anti-flood e avisos individuais deduplicados segundo preferência.
6. Duas execuções de cron concorrentes → no máximo um alerta por chat/incident.
7. Telegram 429 e timeout → backoff com log; não marcar sucesso antes da API confirmar.
8. Recuperação real → no máximo uma mensagem de retorno ligada a incidente aberto.
9. Expiração de assinatura / zero crédito → nenhuma sonda ou alerta para clientes sem autorização.
10. Comparar fonte Cloudflare e estado do painel por no mínimo 24h antes de desligar qualquer fallback remanescente.

## Operação e rollback
- Não alterar cadastros, credenciais, assinaturas ou crédito para corrigir uptime.
- Releases pequenos com CI (unitários, TypeScript, compilação e sondagens de teste) e checagem de produção.
- Se uma rota falhar, suspender a notificação automática da nova fonte e manter status **não confirmado** em vez de restaurar falsos Online. Diagnóstico e rollback da versão com logs auditáveis.
- Não comunicar ao cliente que um provedor de terceiros está restabelecido sem checagem desse provedor.
