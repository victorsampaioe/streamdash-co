# Plano de Implementação: Web Player Público - Reprodução e Detalhes

Este plano foca na finalização da rota pública do Web Player (`/player/$resellerId`), implementando a funcionalidade de reprodução de vídeo para TV ao vivo (CORS/TS bypass), filmes e séries, além de modais de detalhes e integração com o Core AWS.

## Mudanças do Usuário

- **Reprodução de Vídeo Funcional:** O usuário poderá assistir canais ao vivo (mesmo em formato `.ts`), filmes e séries diretamente no navegador.
- **Modais de Detalhes:** Informações extras sobre filmes e séries (sinopse, ano, classificação) antes de dar o play.
- **Interface Fluida:** Seleção de temporadas para séries e navegação intuitiva entre conteúdos.

## Mudanças Técnicas

- **Proxy de Stream (CORS & .ts):** Implementar um endpoint de proxy no Core AWS que recebe a URL do stream IPTV e a repassa para o player com os headers corretos, permitindo que arquivos `.ts` sejam reproduzidos via HLS ou como stream direto (dependendo do suporte do navegador/Hls.js).
- **Integração Hls.js:** Adicionar a biblioteca `hls.js` dinamicamente para suportar streaming adaptativo e formatos legados no Chrome/Firefox.
- **Novas Server Functions:** 
  - `getStreamUrl`: Gera uma URL de proxy assinada para o player.
  - `getContentInfo`: Busca metadados detalhados de um filme ou série via Xtream.
- **Componentes de UI:**
  - `VideoPlayer`: Componente dedicado com controles customizados e suporte a Hls.js.
  - `ContentDetailsModal`: Exibição de informações e seleção de episódios/filmes.

## Considerações de Segurança

- **Tokens de Sessão:** Apenas clientes autenticados via `player_sessions` podem gerar URLs de proxy.
- **Bypass de CORS:** O proxy no Core AWS ocultará as credenciais do servidor IPTV do cliente final.
- **Idempotência:** Verificação contínua de expiração de conta/dispositivo.
