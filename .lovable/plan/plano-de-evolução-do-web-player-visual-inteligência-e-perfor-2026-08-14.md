# Plano de Evolução do Web Player (Visual, Inteligência e Performance)

Este plano visa elevar o Web Player ao padrão de plataformas de streaming premium (Netflix/Prime Video), priorizando a estabilidade do catálogo principal e corrigindo bugs críticos.

## 0. Correções Urgentes
- **Configurações:** Corrigir a tela preta ao acessar as configurações, garantindo que o estado de visualização (`activeView`) mude corretamente.
- **Logout:** Implementar o encerramento real da sessão no servidor (tabela `player_sessions`) e limpeza total de dados locais (localStorage) ao clicar em "Sair".

## 1. Performance e Resiliência (Lazy Loading Inteligente)
- **Renderização Prioritária:** A Home e o catálogo carregarão imediatamente.
- **Camadas em Background:** Telemetria (`getServerStatus`) e diagnósticos serão movidos para componentes com carregamento tardio (lazy) e tratamento de erro isolado.
- **Fallbacks Silenciosos:** Falhas na telemetria mostrarão "Status indisponível" sem travar a UI ou o vídeo.

## 2. Experiência de Conteúdo Premium
- **Tela de Detalhes:** Implementar modal/overlay de detalhes para Filmes e Séries com Banner, Sinopse, Elenco e botões de ação (Assistir, Minha Lista).
- **Integração TMDB (MVP):** Matching automático de títulos para enriquecer o catálogo com capas e metadados reais, usando cache local para performance.
- **Categorização de TV:** Organizar canais ao vivo por categorias (Esportes, Kids, Filmes) com visual premium.

## 3. PWA e Mobile
- **Instalação:** Configurar ícones dinâmicos baseados no logo da revenda para permitir a instalação como aplicativo standalone.
- **Navegação:** Ajustar o "Continuar Assistindo" para ser persistente e intuitivo.

## Detalhes Técnicos
- **Matching de Títulos:** Lógica de normalização de strings (remover "4K", "FHD", anos) para busca na API de metadados.
- **Error Boundaries:** Envolver widgets de status para evitar propagação de falhas.
- **Cleanup:** Migrar limpeza de tokens para um helper centralizado.

---
Vou começar pelas correções urgentes e a infraestrutura de performance.