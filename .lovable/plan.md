# Plano de Correção do Player e Proxy HLS

Este plano foca na correção da TV ao Vivo (HLS), na limpeza da interface para o usuário final e na melhoria da velocidade de abertura do player, conforme solicitado.

## Etapa 1: Correção de TV ao Vivo (HLS) no Core
O objetivo é garantir que o manifesto `.m3u8` e seus segmentos `.ts`/`.m4s` sejam entregues corretamente pelo Core AWS, resolvendo o erro 404 e falhas de carregamento contínuo.

- **Instrumentação HLS**: Adicionar logs detalhados no `stream.ts` para rastrear o fluxo do manifesto e dos segmentos (URL original, status, tempo de resposta).
- **Reescrita de Manifestos**: Ajustar `rewriteManifest` para garantir que URLs relativas e URIs de chaves/segmentos sejam corretamente convertidos para passar pelo proxy com assinatura HMAC.
- **Headers de Origem**: Garantir que o proxy encaminhe headers críticos (como `Content-Type` de streaming e cookies de autenticação se presentes na origem).
- **Estabilidade HLS.js**: Validar se o player consegue buscar a playlist e os segmentos continuamente através do proxy.

## Etapa 2: Experiência Premium e Limpeza de UI
Remover detalhes técnicos da visão do usuário e mover diagnósticos para uma camada administrativa.

- **Limpeza do Player**: Ocultar o HUD de diagnóstico (status HTTP, ranges, codecs técnicos) da tela do usuário final.
- **Mensagens Amigáveis**: Substituir erros técnicos por mensagens de status legíveis como "▶ Carregando conteúdo..." e "Este conteúdo está temporariamente indisponível".
- **Nova Área Administrativa**: Criar/Ajustar a rota `Admin -> Debug -> Diagnóstico de Reprodução` para abrigar essas informações técnicas.

## Etapa 3: Performance de Abertura ("Quick Play")
Otimizar o fluxo de inicialização do vídeo para reduzir o tempo de espera do usuário.

- **Fluxo Assíncrono**: Alterar o clique de reprodução para abrir o player imediatamente, movendo as validações de diagnóstico e testes de codec para segundo plano.
- **Otimização de Buffer**: Ajustar a configuração inicial do HLS.js e do vídeo nativo para começar a reprodução com um buffer menor, priorizando o início rápido do frame (Time to First Frame).
- **Persistência**: Manter a conexão com o Core otimizada para requisições subsequentes de segmentos.

## Critérios de Sucesso
- Canal "Globo RPC Curitiba HD" reproduzindo sem falhas via Core (HTTP 200/206).
- Interface do player limpa, sem logs técnicos visíveis para o cliente.
- Redução perceptível no tempo entre o clique no conteúdo e a exibição do primeiro frame.
