# Plano de Melhoria: Web Player Stream Monitor Premium Mobile & Inteligência

Este plano descreve a transformação do Web Player atual em uma experiência premium focada em dispositivos móveis e inteligência de diagnóstico, integrando as capacidades do Stream Monitor (Core AWS, Health Score, Incidentes) diretamente na interface do cliente final.

## 1. Otimização Mobile Premium
Transformar o layout em uma experiência de "App Nativo".

- **Navegação Inferior Fixa**: Implementar `BottomNav` para troca rápida entre Início, Buscar, Favoritos, TV ao Vivo e Configurações.
- **Layout Responsivo**:
  - Banner Hero vertical (9:16) ou 4:3 otimizado para mobile.
  - Carrosséis horizontais para categorias (Continuar Assistindo, Populares).
  - Cards de conteúdo maiores e com toque facilitado.
- **Player Mobile**:
  - Interface simplificada com controles grandes (Play/Pause, Volume, Fullscreen).
  - Suporte nativo a rotação horizontal.
  - Otimização de carga (Lazy Loading real e paginação por demanda).
- **Busca Mobile**: Interface dedicada com filtros rápidos (Filmes, Séries, Canais).

## 2. Camada de Inteligência e Diagnóstico
Traduzir dados técnicos complexos em mensagens simples e úteis para o cliente final.

- **Diagnóstico Pré-Reprodução**: Verificação rápida de Status, DNS e Health Score antes de iniciar o stream.
- **🧠 Diagnóstico Inteligente**: Função central que analisa falhas (Tela preta, Timeout, Erro 403) e cruza com dados do monitoramento:
  - 🟢 **Normal**: Tudo ok.
  - 🟡 **Servidor Instável**: Problema detectado no backend (Health baixo/Incidente).
  - 🛜 **Problema de Conexão**: Servidor ok, mas falha de comunicação do dispositivo.
  - 🎬 **Problema no Conteúdo**: Apenas aquele stream específico falhando.
- **Indicadores Visuais**: Status simplificado (semáforo) na interface, com modal de detalhes amigável.
- **Integração de Incidentes**: Mostrar aviso de "Instabilidade já identificada" se houver um incidente aberto no Stream Monitor.

## 3. Experiência e Retenção
- **Minha Lista (Favoritos)**: Persistência de favoritos por sessão/usuário.
- **Continuar Assistindo**: Salvar progresso de filmes e episódios de séries.
- **Histórico**: Visualização de conteúdos assistidos recentemente.

## 4. Diagnóstico Específico: Uniplay
Resolver a falha de acesso ao servidor Uniplay.

- **Instrumentação de Logs**: Adicionar logs detalhados (sem senhas) no fluxo de login para identificar se a falha é DNS, Timeout, Bloqueio 403 (WAF) ou credenciais.
- **Otimização de Fallback**: Ajustar tempos de timeout no `player_api.php` para evitar esperas excessivas.
- **Validação de Core AWS**: Confirmar se o IP da EC2 (Core) está bloqueado pelo servidor Uniplay.

## Detalhes Técnicos

- **Frontend**: Novos componentes `BottomNav`, `MobileHero`, `DiagnosticBadge` e `HistoryRow` em `src/components/player/`.
- **Backend/RPC**:
  - Evolução de `getPlayerCatalog` para incluir dados de progresso.
  - Novo `diagnosePlayback` no Core/Painel para análise em tempo real.
  - Refatoração de `loginXtreamClient` para logs granulares.
- **Segurança**: Manter isolamento RLS e não expor URLs reais/tokens ao cliente.

O objetivo é: **DIAGNOSTICAR → EXPLICAR → ORIENTAR**, mantendo a identidade visual premium e o sistema white-label.
