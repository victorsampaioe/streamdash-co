# Plano de Evolução — Stream Monitor Play Android (Fase 1)

O objetivo é transformar o MVP funcional (`android-mvp`) em um produto profissional, centralizando a gestão de licenças no painel Admin e automatizando a resolução de servidores para o usuário final.

## Mudanças no Backend (Supabase)

- **Novas Tabelas e Campos**:
  - Adicionar `monitor_play_active` (boolean), `monitor_play_expires_at` (timestamptz) e `monitor_play_status` (enum: 'pending', 'active', 'suspended') à tabela `profiles` ou criar `reseller_licenses`.
  - Criar tabela `client_server_associations` para mapear `client_id` -> `server_id` para logins rápidos.
- **Segurança (RLS)**:
  - Políticas para garantir que apenas Admins possam ativar licenças.
  - RPC para validação de login que verifica o status da licença do revendedor antes de retornar os dados do servidor.
- **Novos Endpoints (TanStack Start)**:
  - `src/routes/api/public/android/login.ts`: Recebe usuário/senha, testa contra servidores do ecossistema e valida licença.
  - `src/routes/api/public/android/status.ts`: Retorna o status de monitoramento de um servidor específico.
  - `src/routes/api/public/android/config.ts`: Retorna a identidade visual do revendedor (logo, cores).

## Mudanças no Painel Admin (Frontend)

- **Nova Seção "Stream Monitor Play"**:
  - Lista de solicitações de ativação.
  - Controle manual de status e validade por revendedor.
  - Dashboards de uso (licenças ativas vs pendentes).

## Mudanças no Projeto Android (`android-mvp`)

- **Refatoração de Arquitetura**:
  - Organizar em pacotes: `data` (XtreamClient), `network` (Retrofit/OkHttp para API Stream Monitor), `domain`, `ui` (Compose), `player` (Media3).
- **Nova Experiência de Login**:
  - Substituir campos de DNS/UA por apenas Usuário e Senha.
  - Implementar o fluxo de "Resolução Automática" via API Stream Monitor.
- **Tela de Status**:
  - Antes de entrar no catálogo, exibir o status real do servidor (Disponível/Instabilidade/Offline).
- **Interface Premium**:
  - Implementar Tema Escuro oficial.
  - Splash Screen com marca "Stream Monitor Play".
  - Carregamento dinâmico de Logo/Identidade do revendedor após o login.

## Detalhes Técnicos

- **Preservação**: Os arquivos `XtreamClient.kt` e `PlayerBox.kt` serão mantidos como o "motor" de reprodução, mas serão movidos para pacotes apropriados.
- **Comunicação**: O app Android falará com o backend via HTTPS/JSON.
- **Licenciamento**: A checagem de `monitor_play_active` será feita no servidor em cada tentativa de login/refresh de token.

