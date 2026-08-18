# Stream Monitor Play — Probe Android (MVP técnico)

Prova técnica **isolada**: não toca no Web Player, no Core AWS nem em nada do painel.
Objetivo único: descobrir se um dispositivo Android real (IP residencial / operadora móvel)
consegue acessar **diretamente** os painéis NEW e UNIPLAY, que hoje bloqueiam o IP da AWS.

## Stack
- Kotlin + Jetpack Compose
- AndroidX Media3 / ExoPlayer (HLS, MP4 com seek/range, MPEG-TS)
- OkHttp (User-Agent configurável, HTTP e HTTPS, aceita certificado self-signed)

## O que a APK faz
1. Tela de login Xtream: DNS, usuário, senha, User-Agent (presets NEW e UNIPLAY já preenchidos)
2. Botão "Rodar teste" executa, direto do dispositivo:
   - `player_api.php` → `LOGIN_OK` / `LOGIN_FAIL`
   - categorias + canais + filmes + séries → `API_OK`
   - 1 canal ao vivo (tenta `.m3u8`, cai para `.ts`) → `LIVE_OK`
   - 1 filme (usa o `container_extension` real, valida Range 206) → `MOVIE_OK`
   - 1 episódio de série → `SERIES_OK`
3. Cada passo registra `HTTP_STATUS`, Content-Type, tempo de resposta e o motivo exato da falha
4. Botões TV / Filme / Episódio abrem o ExoPlayer com seek, retomada e troca de qualidade HLS

Logs aparecem na tela (copiáveis) e no Logcat sob a tag `SMPROBE`. Senha nunca é logada.

## Build da APK

Requer JDK 17 + Android SDK (Android Studio ou command line tools):

```bash
cd android-mvp
./gradlew assembleDebug        # gera app/build/outputs/apk/debug/app-debug.apk
# ou
./gradlew assembleRelease
```

No Android Studio: `File > Open` → pasta `android-mvp` → `Build > Build APK(s)`.

> O wrapper do Gradle não está versionado aqui. Rode `gradle wrapper --gradle-version 8.7`
> uma vez (ou abra no Android Studio, que gera o wrapper automaticamente).

## Como validar a hipótese
Instale a APK e rode o teste **duas vezes** em cada servidor:
1. Com o celular no **Wi-Fi residencial**
2. Com o celular no **4G/5G da operadora**

Se `LOGIN_OK` aparecer em qualquer um dos dois, está confirmado que o bloqueio é por
IP de datacenter e que a arquitetura "vídeo direto pelo dispositivo" resolve NEW/UNIPLAY
sem proxy residencial pago.
