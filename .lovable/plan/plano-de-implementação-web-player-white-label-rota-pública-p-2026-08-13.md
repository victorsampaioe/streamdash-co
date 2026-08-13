# Plano de Implementação: Web Player White-label (Rota Pública /player/$resellerId)

Implementação da rota pública do Web Player funcional, permitindo que clientes finais acessem o catálogo IPTV com a identidade visual do revendedor.

## Alterações de Infraestrutura (Backend)

1.  **Refatoração das Server Functions (`src/lib/player.functions.ts`):**
    *   Remover `requireSupabaseAuth` da `getPlayerSettings` para permitir acesso público (necessário para a tela de login do cliente final).
    *   Implementar `validatePlayerSession` para verificar o token de sessão do cliente.
    *   Implementar `getPlayerCatalog` que atua como proxy para o Core AWS, buscando categorias e conteúdos.

2.  **Extensão do Core AWS API (`src/routes/api/public/core/task.ts`):**
    *   Garantir que a tarefa `iptv-player-proxy` suporte todas as ações necessárias (live, vod, series, categories).

## Alterações de Roteamento e UI

1.  **Novo Layout de Roteamento:**
    *   Criar `src/routes/player.$resellerId.tsx` para lidar com a rota dinâmica (atualmente `/player` é estática e sem ID).
    *   Implementar a tela de login Xtream com campos de usuário, senha e seleção de servidor (filtrando servidores vinculados ao revendedor).

2.  **Funcionalidades do Player:**
    *   **Navegação:** Abas para TV Ao Vivo, Filmes e Séries.
    *   **Catálogo:** Listagem de categorias e itens com busca.
    *   **Reprodução:** Integração com um player de vídeo (ex: `video.js` ou nativo) tratando links `.ts` via proxy/remux no Core AWS quando necessário.

3.  **Identidade Visual:**
    *   Aplicação dinâmica de cores, logo e mensagens recuperadas via `getPlayerSettings(resellerId)`.

## Detalhes Técnicos

*   **Segurança:** Sessões de clientes finais são armazenadas em `player_sessions` com validade de 7 dias.
*   **Performance:** Uso de cache no Core AWS para respostas da Player API para evitar rate limit nos servidores IPTV.
*   **Compatibilidade:** Fallback de reprodução para formatos não suportados nativamente pelo navegador.
