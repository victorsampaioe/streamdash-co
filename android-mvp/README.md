# Stream Monitor Play

INSTRUÇÃO PRINCIPAL — ALTERAÇÃO EXPLICITAMENTE SOLICITADA
O usuário pediu uma mudança real no projeto. Implemente diretamente o pedido, sem transformar a execução em uma simples explicação.
Não invente requisitos. Preserve tudo que não fizer parte do pedido.
Inspecione os arquivos/componentes responsáveis antes de editar e execute somente as mudanças necessárias.
Não pare aguardando aprovação de um plano quando a alteração puder ser executada diretamente.

PEDIDO ORIGINAL DO USUÁRIO:
O projeto Android foi recriado com o novo layout do Stream Monitor Play.

O APK não compila porque ficaram arquivos antigos de uma implementação anterior.

Corrija totalmente a estrutura Kotlin.

Erro atual:

ProbeRunner.kt:
- Unresolved reference XtreamCreds
- Unresolved reference XtreamClient
- Unresolved reference userAgent
- Unresolved reference optJSONObject

Não quero apenas criar arquivos vazios para sumir o erro.

Faça uma revisão completa:

1. Remova código antigo do ProbeRunner.kt que pertence ao protótipo anterior.
2. Reestruture o monitor/probe usando a arquitetura atual do novo layout.
3. Garanta que todas as classes chamadas existam:
   - models
   - network
   - player
   - monitor
   - data

4. Rode o build Android e corrija todos os erros até ficar:

BUILD SUCCESSFUL

5. Não altere o layout novo do Stream Monitor Play.
6. Não mexa no design, apenas deixe o projeto compilando e funcionando.

O objetivo final é gerar APK debug sem nenhum erro.

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
