# Stream Monitor Play

INSTRUÇÃO PRINCIPAL — ALTERAÇÃO EXPLICITAMENTE SOLICITADA
O usuário pediu uma mudança real no projeto. Implemente diretamente o pedido, sem transformar a execução em uma simples explicação.
Não invente requisitos. Preserve tudo que não fizer parte do pedido.
Inspecione os arquivos/componentes responsáveis antes de editar e execute somente as mudanças necessárias.
Não pare aguardando aprovação de um plano quando a alteração puder ser executada diretamente.

PEDIDO ORIGINAL DO USUÁRIO:
Precisamos refazer o APK do Stream Monitor Play Android usando o novo layout/interface, não quero voltar para o projeto antigo.

O projeto anterior já existia, mas ficou com arquivos inconsistentes. Agora quero uma nova versão organizada baseada no novo design.

Objetivo:

Criar o APK Android do Stream Monitor Play com:

Novo Layout
Interface moderna igual ao conceito do Stream Monitor Play
Tela inicial profissional
Logo Stream Monitor
Design dark premium
Cards modernos
Animações leves
Preparado para virar aplicativo oficial
Primeira versão funcional:

Tela Login:

DNS
Usuário
Senha
Seleção de servidor:
NEW
UNIPLAY

Após login:

Mostrar tela de diagnóstico:

Status do servidor
Login aprovado ou erro
Tempo de resposta
Informações da conexão

Estrutura preparada para adicionar depois:

TV ao vivo
Filmes
Séries
Player ExoPlayer
Catálogo com capas
Integração com Stream Monitor
Importante:

Não reaproveitar arquivos quebrados do MVP antigo.

Criar uma nova base Android limpa usando o novo layout.

Antes de entregar:

Abrir no Android Studio
Rodar build
Corrigir todos os erros
Confirmar BUILD SUCCESSFUL
Gerar APK debug funcionando

Quero primeiro uma versão bonita e funcionando com login + diagnóstico. Depois evoluímos para catálogo e player.

RESULTADO ESPERADO: implemente integralmente a alteração solicitada e preserve funcionalidades não relacionadas.

## Stack
- Kotlin + Jetpack Compose
- AndroidX Media3 / ExoPlayer (HLS, MP4 com seek/range, MPEG-TS)
- OkHttp (User-Agent configurável, HTTP e HTTPS, aceita certificado self-signed)
- Retrofit + OkHttp para comunicação com API Xtream e Stream Monitor

## Estrutura do Projeto
1. Tela de login Xtream simplificada: resolução automática de DNS e validação de licença.
2. Integração com Xtream:
   - Login e carregamento de categorias
   - Listagem de canais ao vivo, filmes e séries com posters
   - Player ExoPlayer otimizado para HLS e Range Requests
3. Interface Premium OTT: Estilo Netflix/Disney+, Mobile-first e compatível com Android TV.

## Build da APK
Requer JDK 17 + Android SDK:
```bash
cd android-mvp
./gradlew assembleDebug
```

