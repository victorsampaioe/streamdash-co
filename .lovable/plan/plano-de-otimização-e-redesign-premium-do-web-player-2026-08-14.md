# Plano de Otimização e Redesign Premium do Web Player

Este plano visa transformar o Web Player em uma experiência de streaming de alta performance e visual premium ("estilo Netflix"), corrigindo o carregamento pesado do catálogo e melhorando a interatividade da Home.

## 1. Otimização de Carregamento (Backend & API)

O carregamento atual busca o catálogo completo de uma vez, o que causa lentidão e alto consumo de memória. Implementaremos uma estratégia de carregamento sob demanda.

- **Paginação na API de Catálogo:**
  - Modificar `getPlayerCatalog` em `src/lib/player.functions.ts` e o helper no servidor para aceitar parâmetros de `offset` e `limit`.
  - Adaptar o motor `iptv-player-proxy` no Core (quando disponível) e o fallback local para realizar fatiamento dos dados.
- **Carregamento Específico por Categoria:**
  - Garantir que ao clicar em uma categoria (ex: "Filmes > Ação"), apenas os itens dessa categoria sejam buscados, sem processar o catálogo inteiro.
- **Carregamento de Episódios sob Demanda:**
  - O catálogo de séries não trará mais os episódios antecipadamente. Os episódios serão buscados apenas quando a série for aberta e uma temporada selecionada.

## 2. Redesign Premium da Home (Estilo Netflix)

A Home será reorganizada para oferecer uma navegação mais rica e interativa.

- **Novas Fileiras Dinâmicas:**
  - **Continuar Assistindo:** Integrada ao histórico de visualização (`player_history`), mostrando o progresso em cada card.
  - **Minha Lista:** Exibição direta dos favoritos na Home.
  - **Recomendados:** Fileira baseada nos itens mais assistidos ou recentes.
- **Interatividade dos Cards:**
  - Efeito de hover aprimorado (zoom suave + elevação) para feedback visual tátil.
  - Skeletons de carregamento elegantes para evitar saltos de layout.
- **Banner Rotativo:**
  - Implementar um carrossel automático no `HeroBanner` para alternar entre os principais conteúdos em destaque.

## 3. Melhorias de UX e Performance no Frontend

- **Lazy Loading de Imagens:** Garantir que capas de filmes e séries utilizem `loading="lazy"` e sejam renderizadas apenas quando entrarem no viewport.
- **Debounce na Busca:** Implementar atraso de 300ms na busca para evitar disparos excessivos de API.
- **Infinite Scroll:** As listagens de categorias (Filmes/Séries/Canais) carregarão mais itens automaticamente conforme o usuário faz o scroll, eliminando travamentos iniciais.

## Detalhes Técnicos

- **Tecnologias:** TanStack Query para gerenciamento de cache e estado de carregamento, Framer Motion (se necessário) para animações de hover, e modificações em Server Functions (`createServerFn`).
- **Persistência:** Sincronização em tempo real do histórico e favoritos via banco de dados para garantir que o progresso seja mantido entre sessões.
