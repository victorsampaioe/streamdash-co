# Plano de Evolução do Web Player: Camadas Inteligentes

Implementar camadas de inteligência no Web Player (`/player/$resellerId`), reaproveitando a infraestrutura de monitoramento existente (Health Score, Circuit Breaker, Diagnóstico) para melhorar a experiência do cliente final e reduzir suporte.

## 1. Diagnóstico Inteligente Pré-Login
Implementação da verificação automática de conexão antes do formulário de login (Opção B).
- Criar server function `checkServerHealth` para testar um servidor específico usando a lógica do `probeXtream`.
- Inserir estado de "Verificando conexão..." no `LoginForm`.
- Realizar checagem em paralelo para os servidores vinculados ao revendedor.
- Exibir indicadores visuais: 🟢 Conexão normal, 🟡 Instabilidade, 🔴 Indisponível.

## 2. Status do Servidor Interno
Exibição de dados de telemetria em tempo real dentro do player logado.
- Adicionar componente de status na Sidebar ou Header do Player.
- Consumir dados de `availability`, `health_score` e `latency` da tabela `servers`.
- Criar `getServerStatus` para buscar esses dados de forma segura.

## 3. Diagnóstico de Reprodução
Melhoria nas mensagens de erro durante o playback.
- Mapear códigos de erro do proxy de stream (`/api/public/core/stream`) e do `hls.js`.
- Traduzir erros técnicos para mensagens amigáveis: "Instabilidade no servidor", "Problema na sua conexão".
- Sugerir soluções automáticas.

## 4. Suporte a PWA
Transformar o Web Player em um Aplicativo Web Progressivo.
- Gerar `manifest.json` dinâmico com cores e ícones da marca do revendedor.
- Registrar Service Worker básico para cache de assets.
- Configurar meta tags para modo standalone (tela cheia).

## Detalhes Técnicos
- **Reaproveitamento:** Usar `src/lib/iptv.server.ts` (probeXtream) e dados da tabela `servers`.
- **Backend:** Novas funções em `src/lib/player.functions.ts` protegidas por RLS/Session.
- **Frontend:** Atualizações nos componentes em `src/components/player/` e na rota `src/routes/player.$resellerId.tsx`.
- **Segurança:** Garantir que o cliente final nunca veja o `host` real do servidor, apenas o status mascarado.
