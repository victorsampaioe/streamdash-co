# Plano de Otimização de Performance, Acessibilidade e SEO

Este plano visa resolver os problemas de velocidade, acessibilidade e SEO relatados pelo Google PageSpeed Insights e Google Ads, seguindo as melhores práticas modernas de desenvolvimento web.

## 1. Otimização de Imagens
- **Compressão e Formatos:** Converter ativos locais e imagens dinâmicas para WebP/AVIF.
- **Dimensionamento Responsivo:** Implementar `srcset` e `sizes` para evitar o carregamento de imagens desnecessariamente grandes em dispositivos móveis.
- **Lazy Loading:** Garantir que `loading="lazy"` esteja presente em todas as imagens abaixo da dobra (fold).
- **Estabilidade de Layout:** Definir dimensões explícitas (`width`, `height`) ou `aspect-ratio` para eliminar deslocamentos de layout (CLS).

## 2. Redução de JavaScript e Code-Splitting
- **Importações Dinâmicas:** Utilizar `React.lazy` ou o suporte nativo do TanStack Router para carregar componentes pesados (modais, gráficos, seções secundárias) apenas quando necessário.
- **Limpeza de Dependências:** Revisar o `package.json` e importações para identificar e remover código não utilizado no bundle principal.

## 3. Eliminação de Bloqueio de Renderização
- **CSS Crítico:** Otimizar o carregamento do CSS para priorizar a renderização inicial.
- **Scripts Externos:** Garantir que scripts de terceiros (Telegram, analytics) usem `defer` ou `async` e sejam carregados sem bloquear o "First Paint".

## 4. Estrutura Semântica e Acessibilidade (Navegação Agêntica)
- **Landmarks HTML5:** Envolver o conteúdo principal em uma tag `<main>` em todas as rotas relevantes.
- **Hierarquia de Títulos:** Corrigir a sequência de H1 a H6 para garantir uma árvore de acessibilidade clara.
- **IA/LLM Readiness:** Criar o arquivo `public/llms.txt` para orientar agentes de IA sobre o propósito e estrutura do site.

## 5. Performance de Rede e Cache
- **Preloading:** Adicionar `<link rel="preload">` para fontes e imagens críticas do Hero.
- **Políticas de Cache:** Embora o deploy gerencie o cache, garantiremos que a estrutura de build do Vite (hashes nos nomes dos arquivos) seja aproveitada ao máximo.

## Detalhes Técnicos
- Utilização de `@tanstack/react-router` para code-splitting nativo.
- Tailwind CSS v4 para manter o bundle CSS otimizado.
- Verificação de métricas via Lighthouse/PageSpeed após cada mudança significativa.

