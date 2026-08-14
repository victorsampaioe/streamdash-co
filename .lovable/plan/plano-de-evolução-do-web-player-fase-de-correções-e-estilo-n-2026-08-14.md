# Plano de Evolução do Web Player - Fase de Correções e Estilo Netflix

Este plano foca em corrigir bugs críticos de funcionalidade e elevar a experiência visual da Home para o padrão de grandes plataformas de streaming.

## Mudanças Técnicas

### 1. Correções de Bugs (Prioridade Máxima)
- **Bug 1 (Séries):** Corrigir a abertura da tela de detalhes de séries. O erro atual ocorre porque o componente `ContentDetailsOverlay` tenta tratar séries como filmes ou não repassa os dados corretos para o `SeriesDetails`. Vou unificar a lógica de abertura de detalhes.
- **Bug 2 (Minha Lista):** Implementar e validar a funcionalidade de "Minha Lista".
  - Garantir que a Server Function `toggleFavorite` esteja funcionando.
  - Adicionar o botão "Minha Lista" funcional no `ContentDetailsOverlay` e no `HeroBanner`.
  - Implementar a listagem real na aba "Minha Lista" consumindo `getFavorites`.

### 2. Redesign da Home (Estilo Netflix)
- **Banner Dinâmico:** Atualizar o `HeroBanner` para suportar rotação de conteúdos em destaque.
- **Novas Seções:**
  - **Continuar Assistindo:** Integrar com `player_history` para mostrar conteúdos com barra de progresso.
  - **Minha Lista na Home:** Mostrar os favoritos diretamente na Home como uma fileira de carrossel.
  - **Recomendados:** Lógica simples baseada em categorias populares.
- **Interatividade:** Adicionar efeito de zoom/elevação (hover) nos cards de conteúdo para reforçar a interatividade premium.

### 3. Ajustes de Infraestrutura (Background)
- Garantir que as fileiras da Home carreguem de forma independente (não bloqueante).
- Otimizar o `getPlayerCatalog` para suportar as novas consultas de favoritos e histórico de forma eficiente.

## Detalhes Técnicos
- **Estado:** Adicionar `favorites` e `history` ao estado global da página do player para evitar refetchs constantes.
- **Componentes:**
  - Atualizar `ContentCard` para suportar barra de progresso (para "Continuar Assistindo").
  - Atualizar `ContentDetailsOverlay` para incluir o estado de "favorito" (Plus/Check).

## Verificação
- [ ] Clicar em 3 séries diferentes e confirmar abertura da tela de episódios.
- [ ] Adicionar um filme à lista, atualizar a página e verificar se ele aparece na aba "Minha Lista" e na nova fileira da Home.
- [ ] Assistir a alguns segundos de um vídeo e verificar se ele aparece na seção "Continuar Assistindo" com a barra de progresso correta.
- [ ] Validar o layout mobile (360px) para garantir que as novas fileiras são responsivas.
