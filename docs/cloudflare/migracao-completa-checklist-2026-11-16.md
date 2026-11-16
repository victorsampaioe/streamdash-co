# Stream Monitor — Migração integral para Cloudflare
**Auditoria técnica: 16/11/2026. Estado: migração em curso, produção preservada.**

## Comprovado em produção
- Cloudflare Workers + Cron: motor DNS principal. Uma checagem recente confirmou 138 de 139 DNS ativos aplicados.
- Cloudflare Queues: orquestra a entrega Telegram. Envio final com Bot API e credenciais ainda executado pela aplicação antiga.
- Cloudflare D1: DNS atuais, indicadores agregados e inventários de migração. 46 dias de métricas replicados; **teste de recuperação dessas métricas em D1 isolado passou** (46 dias, 77.116 checks, 17.267 ups, 47.023 downs, 12.826 degradações).
- Cloudflare R2: bucket privado `streammonitor-private-backups` criado, sem domínio público. Worker `streammonitor-private-backup-runner` publicado, **desativado e sem agendamento**, aguardando credencial autorizada.

## Banco de origem e riscos de portabilidade
- Lovable Cloud PostgreSQL: **146 tabelas públicas com RLS, 148 funções, 54 gatilhos, 212 políticas de acesso**.
- ~5.283 MB de armazenamento em Postgres; catálogos e históricos grandes respondem pela maior parte.
- Classificação de inventário D1 (`streammonitor-migration-pilot.live_schema_inventory`, snapshot `cf-migration-2026-11-16-current`):
  - 12 tabelas históricas/catálogos (~3.707 MB)
  - 32 candidatas a monitoramento (~1.553 MB)
  - 28 estruturas sensíveis (~2,2 MB)
  - 74 para revisão (~21,5 MB)
- D1 não executa funções/triggers/Postgres/RLS automaticamente: qualquer migração para SQLite demanda redesenho e autenticação de ponta a ponta.
- Limites D1 (Cloudflare, 30/10/2026): **500 MB por banco Free, 10 GB por banco Paid**; conta/assinatura do cliente não verificada, porque API de billing retornou 403. **Não pressupor plano pago** e não importar arquivos grandes antes de conferir limites.
- Supabase Auth (GoTrue), armazenamento, Pix/webhooks, tarefas e RLS ainda dependem do PostgreSQL/servidor atual. Não mudar DNS principal do site, tokens ou webhooks durante a preparação.

## Backup: estado verificável
- Bucket privado de origem `database_export_15_11_26`: **1 arquivo PostgreSQL, 434.895.355 bytes**.
- Bucket de origem `promo-arts`: **26 arquivos, 45.539.129 bytes**.
- **27 objetos, 480.434.484 bytes** tiveram metadados gravados em `streammonitor-private-backup-jobs.backup_source_preflight`; quantidades e tamanhos conferidos.
- **0 arquivos binários copiados para R2** e **0 restaurações do arquivo PostgreSQL concluídas**.
- A conexão exige segredo dedicado `BACKUP_BRIDGE_TOKEN` no Worker e hash SHA-256 correspondente no `app_settings.cf_private_backup_auth` do servidor; o segredo não deve ser divulgado no chat, no GitHub, em logs ou em SQL simples.
- A tentativa anterior de provisionamento seguro pelo conector foi bloqueada: **não contornar** reutilizando `REGION_WORKER_SECRET`, tokens de serviço ou uma URL pública.
- Após configurar por interface autorizada, iniciar **somente uma rodada canário com arquivo pequeno**, validar acesso e conteúdo, e então cópia R2 multipart com verificação por bytes/hashes. Manter Worker desativado até o teste canário.

## Gatilhos obrigatórios para mudar a produção
1. **Confiança no backup:** copiar e fazer SHA-256 do arquivo PostgreSQL completo; conferir contra hash de origem gerado no backup, se existir. Não confundir `R2 head.size` com verificação criptográfica.
2. **Restauração:** criar ambiente PostgreSQL isolado, restaurar o arquivo e executar `scripts/migration/verify_restored_postgres.sql`; conferir esquema e comparação com um snapshot da mesma data do backup. O backup de 15/11 pode anteceder clientes/pagamentos de 16/11.
3. **Atualização incremental:** capturar eventos e alterações desde a data do arquivo; nenhum cliente, pagamento ou alerta pode ficar para trás.
4. **Autenticação:** implementar sessões seguras e revogação, hash de senha, gerenciamento de acesso administrativo e por revenda e mapeamento das 212 políticas RLS no serviço de destino.
5. **Cobrança:** testagem homologada de Pix, pagamentos duplicados, rejeição e reversão, webhook idempotente e trilhas de auditoria. Não disparar cobranças reais para testar.
6. **Telegram:** migrar token privado com princípio de privilégio mínimo para Workers, testar alertas reais somente para destinatários consentidos, evitar mensagens duplicadas; manter fallback.
7. **Site e APIs:** executar build, disponibilizar Workers Static Assets + backend em subdomínio de staging, checar URLs, login, pagamentos, painel, admin, DNS, recursos IA, upload e revenda.
8. **Cutover:** realizar troca reversível de tráfego apenas após paridade comprovada; preservar o Lovable como editor/staging até a aplicação ficar independente e testada por usuários.

## Plano de rollback
- Nenhum serviço atual é desligado na preparação.
- Se checagens DNS/Telegram pararem, usar fallback legado validado.
- Antes de trocar website e pagamentos, manter origem de leitura/gravação inequívoca e snapshot verificável.
- Se o site de staging Cloudflare falhar, não apontar domínio ao novo Worker. Se o cutover autorizado falhar, reverter roteamento controlado; nunca duplicar webhooks ou pagamentos.

## Próxima dependência manual, sem envio de senhas neste chat
Configurar a credencial privada da ponte de backup **por fluxo autorizado**; só então habilitar o Worker de backup e provar a recuperação de arquivo. Não ativar por SQL/Worker sem secret seguro e compatível nos dois lados.

**Esta auditoria é distinta do rascunho Meta Ads. Nenhum orçamento/campanha deve ser alterado na migração de hospedagem.**
