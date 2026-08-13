# Plano de Implementação: Player Público e Proxy de Vídeo (Fase Final)

Este plano detalha a conclusão da rota pública `/player/$resellerId`, focando na reprodução de vídeo funcional e navegação completa do catálogo IPTV via Core AWS.

## 1. Otimização do Componente Player (Frontend)
- **Arquivo:** `src/routes/player.$resellerId.tsx`
- **Ações:**
  - Corrigir a importação de `getPlayerStreamUrl` (está vindo de `@/lib/player.functions` mas precisa ser importado corretamente no componente).
  - Implementar navegação de "Séries" para "Temporadas" e "Episódios" (atualmente o catálogo está genérico).
  - Adicionar suporte a `AbortSignal` no catálogo para evitar race conditions em navegações rápidas.
  - Implementar o `handleClosePlayer` para garantir a destruição correta da instância do `hls.js`.

## 2. Reforço do Proxy de Streaming (Backend)
- **Arquivo:** `src/routes/api/public/core/stream.ts`
- **Ações:**
  - Validar se o Core AWS está configurado para suportar `Transfer-Encoding: chunked` no proxy de vídeo.
  - Adicionar suporte a Range Requests (206 Partial Content) para permitir "scrolling" na barra de tempo em Filmes e Séries.
  - Corrigir o MIME Type para streams `.ts` e `.m3u8` garantindo compatibilidade com o `hls.js`.

## 3. Delegação de Tarefas no Core AWS
- **Arquivos:** `src/routes/api/public/core/task.ts` e `src/lib/core-api.server.ts`
- **Ações:**
  - Registrar formalmente a tarefa `iptv-stream-proxy` no enum de tarefas.
  - Implementar a lógica de remux/proxy no Core para injetar os headers de segurança (CORS) e User-Agent.

## 4. Melhorias na Experiência do Usuário
- **Ações:**
  - Persistência da sessão Xtream no `localStorage` por revendedor (evitar logins repetidos).
  - Fallback visual para conteúdos sem capa usando iniciais ou ícones temáticos.
  - Mensagens de erro amigáveis para falhas de conexão com o servidor IPTV (ex: 403 Forbidden, 404 Not Found).

## Detalhes Técnicos
```text
Fluxo de Reprodução:
[Navegador] -> [Proxy Core AWS] -> [Servidor IPTV do Cliente]
1. O Navegador solicita o fragmento via /api/public/core/stream?token=...
2. O Core AWS valida o token na player_sessions do banco.
3. O Core AWS busca as credenciais reais (username/password) do servidor.
4. O Core AWS faz o fetch no servidor IPTV original com User-Agent "VLC" ou "IPTV-Player".
5. O stream é repassado ao navegador com headers Access-Control-Allow-Origin: *.
```

## Verificação
- Testar login em um servidor Xtream real.
- Verificar se canais ao vivo (.ts) rodam via HLS.js.
- Verificar se filmes (.mp4) permitem avanço/retrocesso.
- Validar se as cores do revendedor são aplicadas corretamente na UI.
