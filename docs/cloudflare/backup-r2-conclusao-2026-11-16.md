# Conclusão da migração de arquivos privados para Cloudflare R2

**Executado em:** 16/11/2026, 19:41 UTC (16:41 em Fortaleza, UTC−03)  
**Estado:** cópia de arquivos concluída e validada. **Não é migração integral do Stream Monitor.**

## Evidência observada na Cloudflare

| Verificação | Resultado |
|---|---|
| R2 bucket | `streammonitor-private-backups` |
| Domínio público gerenciado / domínio customizado | desabilitado / nenhum |
| Arquivos R2 listados | **27** |
| Total de bytes R2 | **480.434.484** |
| Total de bytes na lista da origem | **480.434.484** |
| Banco PostgreSQL `database_export_15_11_26` | **1 arquivo, 434.895.355 bytes** |
| `promo-arts` | **26 arquivos, 45.539.129 bytes** |
| Falhas de transferência | **0** |
| SHA-256 completo do backup PostgreSQL no R2 | **MATCH** |
| SHA-256 de referência calculado localmente em 15/11/2026 | `d9b75b7ec12fed1052220260b7e437a3d65da17a125793d53d9b71d21c4ebaaf` |
| SHA-256 nas artes pequenas | calculado e comparado na origem e no R2 durante cada cópia |
| Agendamento temporário do Worker de backup | removido (lista de crons vazia) |
| `backup_control.enabled` | `false` |
| Fallback temporário do Worker regional | `false` |
| Fonte original | preservada no Lovable Cloud |

**Arquitetura:** Worker `streammonitor-private-backup-runner` com Secret privado `BACKUP_BRIDGE_TOKEN`, R2 e D1 `streammonitor-private-backup-jobs`. A ponte de matrícula e transferência usa um service binding privado na Cloudflare, sem expor a chave ao regional Worker ou ao GitHub. Um Worker separado `streammonitor-private-archive-verify` fez a leitura R2 inteira em streaming e calculou SHA-256 de 434.895.355 bytes, comparando com o hash que havia sido verificado localmente no backup original. O registro privado em D1 armazenou `archive_sha256_result=matched`.

## Limites da evidência

- A cópia R2 é **um snapshot**, não sincronização contínua. Clientes, pagamentos e histórico alterados após 15/11/2026 **não** estão automaticamente incluídos nessa cópia.
- Um SHA-256 correto prova igualdade dos bytes transferidos, mas **não comprova que o arquivo PostgreSQL possa ser restaurado com todas as tabelas e funções**.
- A restauração PostgreSQL **ainda não foi executada**. Não confundir com o laboratório D1 que restaurou apenas 46 dias de métricas agregadas.
- O PostgreSQL atual (146 tabelas, cerca de 5,3 GB, 212 políticas RLS, 148 funções e 54 gatilhos) ainda sustenta cadastro, autenticação, cobranças e grande parte das APIs do Stream Monitor.
- A Cloudflare D1 usa SQLite; não suporta diretamente os gatilhos, funções, RLS e Auth de PostgreSQL. O cutover requer implementação equivalente, validação e plano de reversão.

## Próximas etapas e condições obrigatórias

1. Recuperar o objeto R2 em **PostgreSQL isolado** e executar `pg_restore --list`, restaurar em uma base vazia e validar `scripts/migration/verify_restored_postgres.sql`; sem tocar em produção.
2. Verificar auth/users, policies, índices, triggers, contadores de perfis/assinaturas/pagamentos **do mesmo instante do snapshot**. O banco atual pode ter mudado após o backup.
3. Criar um novo checkpoint atual e sincronização incremental antes do cutover; o snapshot de 15/11 não deve sobrescrever clientes ou pagamentos novos.
4. Planejar a substituição segura de Supabase Auth, funções Postgres, webhooks Pix e permissões antes de apontar a produção à Cloudflare.
5. Apenas depois de prova de paridade, testar aplicação em subdomínio de staging e aprovar a alteração final de roteamento; preservar rollback.

## Verificação de segurança após encerrar

Última consulta do sistema original em 16/11/2026, 19:42 UTC: Cloudflare como motor DNS, 141 DNS aplicados recentemente de 142 ativos, Telegram com heartbeat recente; 130 perfis, 88 registros de assinatura e 80 registros de pagamento. Esses dados permanecem no banco original e não foram apagados nem modificados por esta migração de arquivos.

**Nenhuma campanha Meta Ads, anúncio, orçamento, cadastro, assinatura ou configuração de cobrança foi alterado durante a cópia R2.**
