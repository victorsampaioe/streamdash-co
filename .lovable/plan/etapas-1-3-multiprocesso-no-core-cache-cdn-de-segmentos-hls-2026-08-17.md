# Etapas 1 + 3 — Multiprocesso no Core + Cache/CDN de segmentos HLS

Assumindo o que foi combinado na análise anterior:
- **Etapa 1**: usar todos os vCPUs do Core (cluster de processos) + ajuste de conexões no Caddy/Node.
- **Etapa 3**: cache/CDN na frente dos segmentos HLS (`.ts`/`.m4s`) e do manifesto curto.

Regra inegociável: **nenhuma mudança de comportamento** em filmes, séries e TV ao vivo. O contrato do endpoint de stream (URL assinada, Range/206, headers, ladder de candidatos) permanece idêntico.

## Plano de rollback (feito ANTES de qualquer alteração)

1. Registrar a versão atual em produção (`CORE_STREAM_VERSION = 2026.08.17-stream-v4-hls-cdn`) e a tag da imagem Docker atual do Core.
2. Publicar a nova versão como **imagem nova com tag própria** (`stream-v5-cache`), mantendo a imagem v4 intacta no host.
3. Cada mudança fica atrás de flag de ambiente, desligada por padrão:
   - `CORE_CLUSTER_WORKERS` (vazio/1 = comportamento atual)
   - `HLS_SEGMENT_CACHE=off|on`
   - `HLS_CACHE_TTL_SECONDS`
4. Rollback em 3 níveis, do mais barato ao mais caro:
   - **N1 (segundos)**: `HLS_SEGMENT_CACHE=off` + restart → volta ao `no-cache` atual.
   - **N2 (segundos)**: `CORE_CLUSTER_WORKERS=1` → volta a processo único.
   - **N3 (1–2 min)**: `docker compose up -d` apontando para a tag v4 anterior.
5. Critério objetivo de rollback: qualquer teste comparativo abaixo do baseline (erro HLS, falha de Range/206, tempo até o primeiro frame pior que o baseline, ou stall novo).

## Etapa 1 — Multiprocesso no Core

- Subir N processos Node do mesmo servidor via `cluster` (worker por vCPU), com respawn em falha.
- Sem estado compartilhado entre processos: o proxy já é stateless; a fila de concorrência (`CORE_MAX_CONCURRENT`) passa a ser por processo, com o total recalibrado para não aumentar a pressão no painel IPTV de origem.
- Ajustar limites de conexão/keep-alive no Caddy e `ulimits` já presentes no compose.
- Nenhuma alteração em rota, assinatura ou resposta.

## Etapa 3 — Cache/CDN dos segmentos HLS

Objetivo: um segmento popular de TV ao vivo é baixado **uma vez** da origem e servido para N espectadores.

- Segmentos (`.ts`/`.m4s`) passam a responder `Cache-Control: public, max-age=<TTL curto>` (alvo: 10–30 s, menor que a janela da playlist).
- Manifesto `.m3u8` continua `no-cache` (ou `max-age=1`) para não congelar a playlist ao vivo.
- **VOD (filmes/séries) não entra no cache compartilhado**: respostas com `Range`/206 continuam `no-cache`, exatamente como hoje. Isso preserva o seek validado.
- Camada de cache: Cloudflare na frente de `core.streammonitor.site`, com regra que só armazena o path dos segmentos.

### Segurança da CDN (requisito explícito)

- A URL que chega ao cliente **nunca** contém host do painel, usuário ou senha Xtream: o upstream continua embutido no par `sig`/`exp` HMAC gerado pelo Core, e a URL real é mascarada nos logs (`maskMedia`) — isso já existe e não muda.
- Assinaturas continuam **de vida curta** (`exp` ~300 s). Nenhum token permanente é emitido, então uma URL vazada expira sozinha.
- A chave de cache exclui os parâmetros de assinatura variáveis, para não guardar credencial/HMAC no objeto em cache; o objeto cacheado é apenas o conteúdo do segmento.
- Headers de resposta continuam sanitizados por `asciiHeader`; nenhum header de diagnóstico expõe host/credencial ao cliente.
- Nada de cache em respostas de erro, 401/403 ou qualquer resposta que carregue `X-Core-Error`.

## Testes obrigatórios após implementar

### A) Comparação antes/depois (funcional)
Executar o mesmo roteiro na v4 (baseline) e na v5:
- TV ao vivo: canal comprovadamente OK (Globo SP FHD) — manifesto 200, segmento `.ts` 200, `video/mp2t`, início de reprodução.
- Filme: 206 Partial Content, seek em 3 pontos distintos.
- Série: 206, retomada de episódio.
- Canal offline conhecido: deve continuar reportando o motivo real, sem mascarar como 502.
Resultado é aprovado só se v5 for igual ou melhor em cada item.

### B) Carga progressiva: 50 → 100 → 200 → 500
Cada patamar mantido por tempo suficiente para estabilizar, medindo:
- CPU e RAM por processo do Core
- banda ingress/egress da NIC
- taxa de erro HLS (manifesto e segmento)
- eventos de buffering/stall por sessão
- latência de resposta (p50/p95) do segmento
- taxa de acerto do cache nos segmentos ao vivo

**500 simultâneos só é declarado suportado** se, no patamar de 500, todos os indicadores acima ficarem dentro de faixa segura ao mesmo tempo — sem erro HLS relevante, sem aumento de buffering e sem saturação de CPU/banda. Caso contrário, reporto o limite real medido e o gargalo encontrado.

## O que NÃO será tocado

Design/UI do player, ladder de candidatos de stream, lógica de assinatura HMAC, arquitetura stateless do Core, comportamento de VOD com Range, rotas e contratos existentes.
