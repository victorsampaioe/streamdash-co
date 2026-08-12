# Plano de Refatoração: Fluxo de Diagnóstico de Conteúdo

Corrigir o fluxo da aba "Diagnóstico" para suportar busca unificada, seleção de servidores e navegação autocontida, evitando redirecionamentos para outras áreas.

## Mudanças Necessárias

### Backend e Integração
- Ajustar `getMyDiagnostics` em `src/lib/diagnostics-history.functions.ts` para usar o middleware `requireSupabaseAuth`, garantindo que o `context.userId` esteja disponível.
- Refinar `searchDiagnosticContent` em `src/lib/diagnostics-search.functions.ts` para garantir que o agrupamento de servidores reflita os dados reais do catálogo.

### Frontend (UI/UX)
- **Busca Unificada**: Substituir `getTmdbFeed` por `searchDiagnosticContent` no componente `ContentDiagnosticPage`.
- **Navegação em Etapas**:
  1. **Pesquisa**: Usuário digita o termo.
  2. **Resultados**: Lista de conteúdos (Canais, Filmes, Séries).
  3. **Seleção de Episódio (apenas Séries)**: Se o conteúdo for série, carregar temporadas e episódios reais via `getSeriesSeasons`.
  4. **Seleção de Servidor**: Mostrar lista de servidores reais que possuem aquele conteúdo/episódio.
  5. **Início do Teste**: Ao clicar em "Testar agora", abrir o `DiagnosticDialog`.
- **Remover Redirecionamentos**: Trocar o componente `Link` por botões de ação que atualizam o estado local da página, mantendo o usuário na rota `/app/diagnostico`.

## Detalhes Técnicos
- Utilizar `useQuery` para carregar temporadas/episódios sob demanda.
- Adicionar estados no componente `ContentDiagnosticPage` para rastrear a seleção (`selectedContent`, `selectedEpisode`, `showServerList`).
- Implementar interface de "Testar agora" com cache info (se disponível no histórico recente).

---

## Verificação
- [ ] Buscar canal (ex: "Globo") e ver lista de servidores.
- [ ] Buscar série e navegar até o episódio antes de ver servidores.
- [ ] Clicar em "Testar agora" e ver o diálogo de 9 etapas abrir sem sair da página.
