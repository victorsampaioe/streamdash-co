# Plano de Ajuste Final Web Player (SaaS Premium)

Este plano visa separar a experiência do cliente (limpa e profissional) da experiência de diagnóstico (Admin), além de otimizar o fluxo de carregamento e resolver falhas no HLS.

## Mudanças Propostas

### 1. Separação de Modo Cliente e Modo Diagnóstico
- **Experiência do Cliente:** Remover todos os dados técnicos (HTTP status, Range, bytes, Core, via, formato, logs) da interface do player.
- **Mensagens Amigáveis:** Substituir logs técnicos por mensagens como "▶ Carregando conteúdo..." e "Não foi possível iniciar este conteúdo. Tente novamente.".
- **Modo Diagnóstico:** Criar um estado persistente (ou via botão `🛠 Ativar modo diagnóstico`) para mostrar o HUD técnico apenas quando solicitado manualmente pelo administrador. Por padrão, mesmo para Admin, o player estará limpo.

### 2. Otimização do Fluxo de Carregamento (Quick Play)
- **Correção de Travamento:** Ajustar o fluxo para que, ao clicar, a busca da URL pelo Core e o diagnóstico ocorram de forma assíncrona com feedback visual imediato ("Carregando...").
- **Timeouts e Fallbacks:** Implementar timeouts de carregamento para evitar telas infinitas ("aguardando...") e garantir fallback caso o Core demore.

### 3. Correção TV ao Vivo (HLS)
- **Resolução de Erro 403:** Investigar e corrigir o bloqueio de origem no manifesto HLS.
- **Instrumentação HLS:** Adicionar logs detalhados `[HLS]` no Core para monitorar Manifest, Segmentos, Tempo e Erros específicos.
- **Refinamento de Headers:** Garantir que o Core envie User-Agent correto e trate headers de autenticação/cookies da origem IPTV.

## Detalhes Técnicos

### Frontend (`src/routes/player.$resellerId.tsx`)
- Adicionar estado `showDebugHud` no player.
- Refatorar o componente `VideoPlayer` interno para esconder o HUD condicionalmente.
- Adicionar botão de ativação de diagnóstico na área de Admin ou configurações.
- Ajustar `handlePlay` para disparar a busca de URL e o probe de forma mais fluida, com timeout de 15s para a URL inicial.

### Backend/Proxy (`src/routes/api/public/core/stream.ts`)
- Adicionar logs `[HLS]` com prefixos claros para depuração no CloudWatch/Logs do Core.
- Revisar a lógica de `rewriteManifest` para garantir que URLs relativas e chaves (#EXT-X-KEY) sejam sempre assinadas e roteadas pelo Core.
- Ajustar os headers enviados no `fetch` da origem para emular melhor players de TV (User-Agent IPTV Smarters).

## Verificação
1. **Teste de Usuário:** Abrir um canal/filme como usuário comum e verificar se a tela está limpa (estilo Netflix).
2. **Teste Admin:** Ativar o modo diagnóstico e verificar se todos os dados técnicos aparecem corretamente.
3. **Teste HLS:** Validar se canais de TV ao vivo (ex: Globo RPC) carregam sem erro 403.
4. **Teste VOD:** Verificar se a busca de URL não trava em "aguardando".
