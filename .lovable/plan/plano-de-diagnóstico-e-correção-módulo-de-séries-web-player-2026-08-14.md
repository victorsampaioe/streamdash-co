# Plano de Diagnóstico e Correção: Módulo de Séries Web Player

O usuário reportou que a correção anterior não resolveu o problema de abertura de séries. O erro persiste ao clicar em séries de diferentes tipos. Este plano detalha a auditoria técnica, implementação de diagnósticos profundos e correção definitiva.

## Análise Técnica Atual
- **Endpoint Anterior:** Provavelmente `get_series_info`.
- **Endpoint Novo:** `get_episodes_list` (Xtream API).
- **Problema Suspeito:** Incompatibilidade de formato entre o que o Core AWS retorna e o que o frontend espera, ou falha na delegação da tarefa `get-series-seasons` vs `iptv-player-proxy`.

## Etapas do Plano

### 1. Auditoria e Diagnóstico de Baixo Nível
- **Auditoria de Logs:** Analisar a tabela `core_execution_logs` para identificar falhas HTTP ou erros de parse JSON vindos da VPS AWS para a tarefa `get_episodes_list`.
- **Modo Debug no Frontend:** Adicionar um console log detalhado `[SERIES_DEBUG]` em `src/routes/player.$resellerId.tsx` capturando todo o ciclo de vida do clique.

### 2. Refatoração da Camada de Dados (Server-side)
- **Unificação de Chamadas:** Garantir que o server function `getPlayerCatalog` em `src/lib/player.functions.ts` trate corretamente o payload para `get_episodes_list`.
- **Tratamento de Fallback:** Se `get_episodes_list` falhar ou retornar vazio, tentar `get_series_info` como fallback automático no `player.server.ts`.
- **Sanitização de Resposta:** Implementar normalização de dados para garantir que campos `null` ou estruturas inesperadas (objetos vs arrays) não quebrem o componente `SeriesDetails.tsx`.

### 3. Melhorias na Experiência do Usuário (UI/UX)
- **Mensagens de Erro Claras:** Substituir alertas genéricos por mensagens específicas como "Não foi possível carregar os episódios deste conteúdo".
- **Skeletons de Carregamento:** Garantir que o estado de loading seja visível e não resulte em "tela preta".

### 4. Validação e Testes Reais
- **Teste Multi-cenário:** Validar com 5 tipos de séries (várias temporadas, temporada única, recente, antiga e servidores distintos).
- **Verificação da Auditoria:** Confirmar que as chamadas estão registradas com sucesso no painel de auditoria do Core AWS.

## Detalhes Técnicos
- **Arquivos afetados:** `src/lib/player.functions.ts`, `src/lib/player.server.ts`, `src/routes/player.$resellerId.tsx`, `src/components/player/SeriesDetails.tsx`.
- **Novo Fluxo de Dados:** 
  - Clique -> `getPlayerCatalog(get_episodes_list)` -> Core AWS -> API Xtream -> Normalização -> Estado React -> UI.
- **Deduplicação e Cache:** Implementar cache de 5 minutos para metadados de séries para evitar flood no Core.
