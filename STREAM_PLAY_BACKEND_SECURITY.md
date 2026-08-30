# Stream Play — Segurança do Backend (contratos e migração)

Documento para o time Android (Gemini/Android Studio). **Nada foi removido**: o APK atual
continua funcionando sem alteração. Todos os campos novos são aditivos.

## 1. Vulnerabilidades encontradas

| # | Severidade | Item |
|---|---|---|
| 1 | CRÍTICO | `/android/associate` confiava no `server_id` enviado pelo app: qualquer APK modificado podia associar um cliente a servidor/revendedor arbitrário. |
| 2 | ALTO | Nenhum rate limit em login/associate/status/config — brute force e abuso livres. |
| 3 | ALTO | Sem sessão: usuário e senha do cliente trafegavam em toda chamada. |
| 4 | ALTO | Sem proteção anti-replay em operações sensíveis. |
| 5 | MÉDIO | `/config` devolvia a linha inteira de `reseller_app_config` (`select *`), incluindo campos internos, e não validava a URL do logo. |
| 6 | MÉDIO | `/status` sem validação de UUID e sem cache/rate limit. |
| 7 | MÉDIO | Logs registravam usuário em claro (`[ANDROID LOGIN] tentativa user=...`). |
| 8 | MÉDIO | Erros retornavam formatos diferentes (`{error}` apenas), sem código estável. |
| 9 | BAIXO | `candidates` sem contrato formal (risco de parsing quebrar novamente). |
| 10 | BAIXO | Sem gestão de versões/atualização verificada por hash. |

## 2. Vulnerabilidades corrigidas

Todas as 10 acima. Detalhe:

- **Associate seguro**: o servidor só é aceito se tiver sido ofertado àquele cliente no login
  (tabela `android_resolution_grants`, TTL 20 min). O `reseller_id` **nunca** vem do app: é lido
  de `servers.owner_id`.
- **Rate limit** por IP + device_id + hash do usuário (tabela `api_rate_limits`, janela fixa).
- **Anti-replay** via `request_id` (tabela `api_request_nonces`, TTL 5 min).
- **Sessão** com access token curto (15 min, HMAC-SHA256 server-side) + refresh rotativo (30 dias).
- **Logs sanitizados** (`sanitizeForLog`): senha, token, Authorization e URLs com credenciais viram `***`;
  usuário aparece mascarado (`vi***33#8f3a1c22`).
- **Envelope de erro** estável.
- **Auditoria** em `security_audit_log`.

## 3. Endpoints

| Endpoint | Situação |
|---|---|
| `POST /api/public/android/login` | Endurecido (compatível) |
| `POST /api/public/android/associate` | Endurecido (compatível) |
| `GET /api/public/android/status` | Endurecido (compatível) |
| `GET /api/public/android/config` | Endurecido (compatível) |
| `POST /api/public/android/refresh` | **Novo** |
| `GET /api/public/android/version` | **Novo** |
| `GET /api/public/tmdb/catalog` | **Novo** (proxy TMDB) |

## 4. Contratos

### 4.1 Login

Request (o campo `device_id` é novo e opcional):

```json
{ "username": "cliente123", "password": "senha", "device_id": "a1b2c3d4e5f6a7b8" }
```

Resposta — servidor identificado (campos antigos preservados, `ok` e `session` são novos):

```json
{
  "ok": true,
  "status": "success",
  "resolved_by": "association",
  "server": { "id": "8f0b8b1e-1f2a-4c53-9f9a-2f0d9c4b7a11", "dns": "http://exemplo.tv:8080", "name": "SERVIDOR X" },
  "server_id": "8f0b8b1e-1f2a-4c53-9f9a-2f0d9c4b7a11",
  "reseller_id": "0c9d3a12-8ba2-4e6f-9c0b-5f7d1e2a3b44",
  "session": {
    "access_token": "eyJzdWIiOiI...w.Qm9k9vYQ2m1Zr8...",
    "token_type": "Bearer",
    "expires_in": 900,
    "expires_at": "2026-08-27T21:45:00.000Z",
    "refresh_token": "9d0f2b7c4a1e8f35c6d2b0a794e13f58c7a1d9e0b3f42a68",
    "refresh_expires_at": "2026-09-26T21:30:00.000Z",
    "scopes": ["play"]
  }
}
```

Resposta — resolução no dispositivo (fluxo `resolve_client` **preservado**):

```json
{
  "ok": true,
  "status": "resolve_client",
  "resolution_token": "e4a9c1b70d3f5a82b6c4d1e0f7a3b592c8d6e4f1a0b7c395",
  "resolution_expires_at": "2026-08-27T21:50:00.000Z",
  "candidates": [
    { "id": "8f0b8b1e-1f2a-4c53-9f9a-2f0d9c4b7a11", "name": "SERVIDOR X", "dns": "http://exemplo.tv:8080" },
    { "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "name": "SERVIDOR Y", "dns": "http://outro.tv:80" }
  ]
}
```

`candidates` é **sempre** um array de objetos com `id`, `name` (string, pode ser vazia) e `dns` (string).
Nunca string solta, nunca `null`.

Erro:

```json
{ "ok": false, "code": "rate_limited", "message": "Muitas tentativas. Aguarde alguns instantes.", "error": "Muitas tentativas. Aguarde alguns instantes.", "retry_after": 143 }
```

Códigos: `invalid_payload`, `unauthorized`, `forbidden`, `not_found`, `rate_limited`,
`replay_detected`, `license_inactive`, `unavailable`, `internal_error`.
O campo `error` (string) existe apenas por compatibilidade com o APK atual.

### 4.2 Associate

```json
{
  "username": "cliente123",
  "password": "senha",
  "server_id": "8f0b8b1e-1f2a-4c53-9f9a-2f0d9c4b7a11",
  "device_id": "a1b2c3d4e5f6a7b8",
  "resolution_token": "e4a9c1b70d3f5a82b6c4d1e0f7a3b592c8d6e4f1a0b7c395",
  "request_id": "3f0c9a2b-7d41-4c5e-9b62-8a1d0f7e6c53"
}
```

`resolution_token`, `device_id` e `request_id` são **opcionais**. Sem eles o backend usa o grant
mais recente daquele cliente (compatibilidade com o APK atual). Recomendado enviar os três na
próxima versão.

Resposta: igual ao login com `"resolved_by": "client"`.
Se o `server_id` não constar dos candidatos ofertados: `403 { "ok": false, "code": "forbidden" }`.

### 4.3 Status

`GET /api/public/android/status?server_id=<uuid>`

```json
{
  "ok": true,
  "status": "up",
  "state": "online",
  "last_check": "2026-08-27T21:12:44.000Z",
  "last_check_at": "2026-08-27T21:12:44.000Z",
  "latency": 184,
  "message": "Tudo funcionando normalmente"
}
```

`state` ∈ `online | degraded | offline | unknown`. `status` mantém o valor bruto antigo.
Cache público de 30 s.

### 4.4 Config

`GET /api/public/android/config?reseller_id=<uuid>`

```json
{
  "ok": true,
  "app_name": "Play do Provedor",
  "logo_url": "https://cdn.exemplo.com/logo.png",
  "primary_color": "#3B82F6",
  "footer_text": "Powered by Stream Monitor"
}
```

`logo_url` só é devolvido quando é HTTPS pública e válida; caso contrário vem `null`.
Cache público de 300 s.

### 4.5 Refresh (novo)

`POST /api/public/android/refresh`

```json
{ "refresh_token": "9d0f2b7c4a1e8f35c6d2b0a794e13f58c7a1d9e0b3f42a68" }
```

```json
{ "ok": true, "session": { "access_token": "...", "expires_in": 900, "refresh_token": "...", "scopes": ["play"] } }
```

Rotação: o refresh usado é revogado. Token inválido/expirado → `401 unauthorized`.

### 4.6 Versão (novo)

`GET /api/public/android/version`

```json
{
  "ok": true,
  "release": {
    "version_code": 12,
    "version_name": "1.4.0",
    "minimum_version_code": 8,
    "recommended_version_code": 12,
    "mandatory": false,
    "message": "Correções no player e login mais rápido.",
    "update_url": "https://cdn.streammonitor.site/apk/stream-play-1.4.0.apk",
    "sha256": "6b2f1a...c94d",
    "file_size": 24810112,
    "signing_fingerprint": null,
    "published_at": "2026-08-27T20:00:00.000Z"
  }
}
```

Sem versão publicada: `{ "ok": true, "release": null }`.
O app deve comparar o SHA-256 do arquivo baixado antes de instalar e, se o endpoint falhar,
seguir com o último cache válido (o app **não** pode depender deste endpoint para funcionar).

### 4.7 TMDB (novo — remover a chave do APK)

```
GET /api/public/tmdb/catalog?kind=search&query=duna
GET /api/public/tmdb/catalog?kind=feed&feed=trending&page=1
GET /api/public/tmdb/catalog?kind=detail&media=movie&id=693134
```

```json
{ "ok": true, "cached": true, "data": [ { "media_type": "movie", "tmdb_id": 693134, "title": "Duna: Parte 2", "poster_path": "/abc.jpg", "backdrop_path": "/def.jpg", "vote_average": 8.2, "release_date": "2024-02-27" } ] }
```

Cache: busca 6 h, feeds 3 h, detalhe 24 h. Limite: 120 req / 5 min por IP e 3000 / 5 min global.
A chave TMDB permanece somente no servidor.

## 5. Sessão / expiração

- Access token: 15 minutos, HMAC-SHA256 assinado com `ANDROID_SESSION_SECRET` (somente servidor).
- Claims: `sub` (hash do usuário), `rid`, `sid`, `did`, `scp`, `exp`, `jti`. **Sem senha IPTV.**
- Refresh: 30 dias com rotação e revogação imediata do anterior.
- Revogação por dispositivo: `android_devices.revoked = true`.
- **Nenhum segredo global no APK** (sem HMAC embutido). Preparado para chave por dispositivo
  via Android Keystore no futuro (`android_devices.device_id` já é a âncora).

## 6. Rate limits aplicados

| Bucket | Limite |
|---|---|
| login por IP | 60 / 5 min |
| login por device | 12 / 5 min |
| login por usuário (hash) | 8 / 5 min e 30 / 1 h |
| associate por IP | 40 / 5 min |
| associate por usuário | 10 / 5 min |
| status por IP | 240 / 5 min |
| config por IP | 120 / 5 min |
| refresh por IP | 60 / 5 min |
| version por IP | 120 / 5 min |
| TMDB por IP / global | 120 / 5 min e 3000 / 5 min |

Limites por IP são altos de propósito para não punir centenas de clientes atrás do mesmo NAT;
o controle fino é por usuário e dispositivo.

## 7. Brute force

Mensagem genérica para qualquer falha (`invalid_payload` / `unauthorized`), sem distinguir
"usuário não existe" de "senha incorreta". Tentativas excedentes viram `429` com `retry_after` e
registro em `security_audit_log` (`android.login.rate_limited`).

## 8. Tabelas e índices criados

`api_rate_limits`, `android_devices`, `android_sessions`, `android_resolution_grants`,
`api_request_nonces`, `app_releases` (+ trigger HTTPS), `tmdb_cache`, `security_audit_log`.
Índices: janela de rate limit, expiração de sessões/grants/nonces/cache, revendedor por dispositivo,
auditoria por data. RLS ligada em todas; leitura autenticada apenas para admin (auditoria, versões)
e revendedor dono (dispositivos). Nenhuma delas é exposta a visitantes.

## 9. Pendente do lado Android (Gemini)

1. Enviar `device_id` estável no login/associate.
2. Guardar `session.access_token`/`refresh_token` no EncryptedSharedPreferences e chamar `/refresh`.
3. Enviar `resolution_token` e `request_id` no associate.
4. Migrar TMDB para `/api/public/tmdb/catalog` e remover a chave do APK.
5. Consumir `/android/version` e validar SHA-256 antes de instalar.
6. Ler `code` do envelope de erro em vez do texto de `error`.

## 10. Não ativado por compatibilidade

- Autenticação **obrigatória** por Bearer nos endpoints (o verificador existe em
  `android-session.server.ts`, mas nenhum endpoint exige token ainda).
- Rejeição de associate sem `resolution_token` (hoje aceita o grant mais recente do cliente).
- Remoção do campo legado `error` das respostas.
- Remoção de `status` bruto em `/status`.

Cada um desses itens pode ser ligado assim que a nova versão do Stream Play estiver publicada.
