# Stream Monitor Play

INSTRUÇÃO PRINCIPAL — ALTERAÇÃO EXPLICITAMENTE SOLICITADA
O usuário pediu uma mudança real no projeto. Implemente diretamente o pedido, sem transformar a execução em uma simples explicação.
Não invente requisitos. Preserve tudo que não fizer parte do pedido.
Inspecione os arquivos/componentes responsáveis antes de editar e execute somente as mudanças necessárias.
Não pare aguardando aprovação de um plano quando a alteração puder ser executada diretamente.

PEDIDO ORIGINAL DO USUÁRIO:
O projeto android-mvp atual é apenas um teste técnico.

Quero criar agora o aplicativo Android oficial Stream Monitor Play.

Não criar um Probe.

Criar um app Android completo usando Kotlin + Jetpack Compose contendo:

- Tela inicial com logo Stream Monitor Play
- Login por usuário e senha
- Integração com API Xtream
- Carregar categorias de TV, filmes e séries
- Lista com capas
- Detalhes do conteúdo
- Player usando ExoPlayer
- Suporte HLS (.m3u8)
- Histórico continuar assistindo
- Interface estilo streaming premium

Criar um novo projeto Android pronto para gerar APK.

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

