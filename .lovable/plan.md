# Plano de Implementação: Diagnóstico de Conteúdo (Itens 3 e 4)

Este plano foca na implementação real da persistência do histórico e na lógica de cache/deduplicação do motor de diagnóstico de conteúdo.

## Item 3 — Histórico de Diagnósticos

### Problemas identificados
- A tabela `content_diagnostics` exige `user_id` obrigatório, impedindo que o Core AWS (que roda sem sessão de usuário) grave registros.
- O motor `diagnostics.server.ts` tenta gravar na tabela, mas as falhas de RLS ou constraints de chave estrangeira podem estar silenciando os erros.
- Falta de GRANTs adequados para inserção por perfis autenticados.

### Ações
1.  **Ajuste de Schema**: Alterar `user_id` para opcional (permitir `NULL`) e remover a constraint de chave estrangeira rígida se necessário, ou garantir que a política de inserção permita registros sem `user_id`.
2.  **Políticas RLS**:
    - `INSERT`: Permitir para `authenticated` e `service_role`.
    - `SELECT`: Usuários vêem apenas os seus (`user_id = auth.uid()`), admins vêem tudo.
3.  **Refatoração do Motor**:
    - Garantir que o `INSERT` ocorra com os campos corretos (`error_message` em vez de `error`).
    - Adicionar logs explícitos no servidor para confirmar o sucesso/falha da persistência.

## Item 4 — Cache e Deduplicação

### Problemas identificados
- O `single-flight` atual usa um `Map` em memória, que é volátil e isolado por instância de execução (não funciona entre múltiplos workers).
- Não há mecanismo de cache persistente para evitar testes repetitivos do mesmo conteúdo no mesmo servidor em curto espaço de tempo.

### Ações
1.  **Deduplicação Global**: Usar uma flag `is_running` na tabela de cache (ou uma tabela de locks dedicada no Postgres) para garantir que apenas um teste ocorra por `server_id + content_id` simultaneamente em todo o cluster.
2.  **Mecanismo de Cache**:
    - Implementar busca prévia na tabela `content_diagnostics` por registros recentes (TTL 120s para sucesso, 60s para falha).
    - Se houver registro recente, retornar o status cacheado e marcar `is_cached: true`.
3.  **UI Feedback**: Ajustar o componente de diálogo para exibir "Resultado recuperado do cache (há X segundos)" quando aplicável.

## Detalhes Técnicos

- **Tabela**: `public.content_diagnostics`
- **RPCs**:
    - `acquire_diagnostic_lock(server_id, content_id)`
    - `release_diagnostic_lock(server_id, content_id)`
- **Cache**: Consulta direta por `created_at > now() - interval '120 seconds'`.
