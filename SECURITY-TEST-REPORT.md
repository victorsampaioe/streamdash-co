# 🔐 Relatório de Teste de Segurança Pós-Correção — Stream Monitor

Data: 03/08/2026 · Ambiente: produção (backend Lovable Cloud) · Método: testes black-box via API REST/RPC com chave pública (visitante) + auditoria de políticas RLS e permissões de execução.

## 1. Resumo executivo

| Cenário testado | Resultado |
| --- | --- |
| Visitante lê dados de revendedores | ✅ Bloqueado |
| Visitante executa funções administrativas | ✅ Bloqueado |
| Visitante/usuário altera assinatura | ✅ Bloqueado (corrigido nesta etapa) |
| Credenciais IPTV / hosts expostos | ✅ Não expostos |
| Servidores privados de terceiros | ✅ Não acessíveis |
| Mensagens de erro técnicas | ✅ Sanitizadas |
| Rate limit em endpoints públicos | ⚠️ Pendente (ver seção 6) |

## 2. Testes como visitante (não autenticado)

Leitura direta das tabelas com a chave pública — todas retornaram lista vazia (RLS ativo, nenhuma política para visitantes):

| Tabela | Resposta |
| --- | --- |
| servers (id, name, host, iptv_username) | `200 []` |
| profiles | `200 []` |
| subscriptions | `200 []` |
| payments | `200 []` |
| user_roles | `200 []` |
| payout_requests | `200 []` |
| monitored_contents | `200 []` |
| iptv_syncs | `200 []` |

Escrita:

- `POST /servers` → `401` — *new row violates row-level security policy*
- `PATCH /subscriptions` → `200 []` (nenhuma linha afetada — nada alterado)

## 3. Funções administrativas (visitante)

Todas retornaram `401 / 42501 permission denied for function`:

`get_admin_stats`, `get_admin_users`, `admin_list_payout_requests`, `admin_grant_subscription`, `get_storage_report`, `purge_old_metrics`, `rollup_metrics`, `finalize_approved_payment`, `request_payout`, `activate_free_trial`, `evaluate_achievements`, `delete_server`, `get_referral_summary`, `get_iptv_ranking`, `iptv_recent_titles`.

Exposição pública intencional (somente dados já públicos, sem host/credencial): `get_public_status`, `get_public_checks`, `get_public_dns_list`, `get_reseller_page`, `is_valid_referral_code`.

## 4. Isolamento entre revendedores (revisão de RLS)

- `servers`: SELECT/UPDATE/DELETE apenas `owner_id = auth.uid()`; INSERT exige assinatura ativa. Admin via `has_role()`.
- `monitored_contents`: `reseller_id = auth.uid()`.
- `iptv_syncs`: só através do vínculo com servidor próprio.
- `profiles`, `subscriptions`, `payments`, `payout_requests`, `user_roles`: leitura restrita ao próprio `auth.uid()`.
- `referrals`: visível apenas para indicador ou indicado.
- Papéis ficam em tabela separada (`user_roles`) com verificação via `has_role()` SECURITY DEFINER — sem escalonamento por perfil.
- Nomes/IDs de servidores de terceiros permanecem mascarados (`mask_server_id` / `mask_server_name`) nos rankings e comparativos.

## 5. Correções aplicadas nesta etapa

1. **Auto-liberação de assinatura (crítico)** — a política `subs: user inserts own` permitia que um usuário autenticado criasse a própria assinatura com qualquer plano e vencimento. Removida: assinaturas agora só nascem pelo fluxo de pagamento (privilegiado) ou pelo administrador.
2. **Pagamento forjado (alto)** — a política de inserção em `payments` não validava o estado. Substituída por regra que exige `status = 'pending'`, `paid_at` vazio e valor positivo.
3. **Mensagens de erro genéricas** — novo middleware de servidor (`src/lib/safe-error.ts` + `src/start.ts`) intercepta erros das funções de servidor, registra o detalhe apenas no log e devolve ao navegador uma mensagem curta e neutra sempre que o texto contiver SQL, nomes de tabela/coluna, host/IP, URL, credencial ou stack trace. Mensagens de negócio já escritas para o usuário continuam intactas.

## 6. Pendência: rate limit

O backend ainda não possui um recurso padrão de limitação de taxa. Endpoints públicos expostos hoje: webhook do Mercado Pago (protegido por validação de origem/assinatura), webhook do Telegram, endpoints de regiões/cron e as RPCs públicas listadas na seção 3. Recomenda-se limite por IP nesses caminhos; a implementação depende de uma solução ad-hoc (contador em tabela ou proteção na borda) a ser aprovada.
