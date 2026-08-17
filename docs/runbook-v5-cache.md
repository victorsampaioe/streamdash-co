# Runbook — deploy e validação da versão `2026.08.17-stream-v5-cache`

Execute **na VPS/Core AWS** (`ssh ubuntu@56.125.119.221`, projeto em `/opt/streammonitor`).
Regra de ouro: **um passo por vez**. Se um patamar apresentar buffering, erro HLS ou CPU/rede em
zona perigosa, **pare** e faça rollback — não avance.

Limites de corte (usados em todos os patamares):

| Indicador | Seguro | Alerta | Parar |
|---|---|---|---|
| CPU média do container | < 60% | 60–80% | > 80% |
| RAM do container | < 700 MB | 700–850 MB | > 850 MB (limite 1 GB) |
| Egress da NIC | < 50% do baseline da instância | 50–75% | > 75% |
| Erro de segmento | 0% | até 0,5% | > 0,5% |
| p95 do segmento | < 1500 ms | 1500–3000 ms | > 3000 ms |

---

## 0. Baseline (v4, antes de qualquer mudança)

```bash
cd /opt/streammonitor
docker compose ps
curl -s http://127.0.0.1:3000/api/public/health | jq          # anote streamVersion (v4)
docker images | grep streammonitor                            # anote a tag/ID da imagem atual
docker tag streammonitor/core:latest streammonitor/core:v4-rollback
```

Roteiro funcional de baseline (guarde a saída para comparar depois):

```bash
CRON_SECRET=<mesmo do painel> CORE_API_URL=https://core.streammonitor.site \
node scripts/verify-core-stream.mjs \
  "http://kodexk.click/live/<USER>/<PASS>/101832.m3u8" \
  "http://kodexk.click/movie/<USER>/<PASS>/<id>.mp4" \
  "http://kodexk.click/series/<USER>/<PASS>/<id>.mp4" | tee /tmp/baseline-v4.txt
```

Esperado: live `200 application/vnd.apple.mpegurl`; filme e série `206 video/mp4` com `Content-Range`.

---

## 1. Deploy da v5 (ainda com tudo desligado)

```bash
cd /opt/streammonitor
sudo git pull
grep -E 'CORE_CLUSTER_WORKERS|HLS_SEGMENT_CACHE' .env || cat >> .env <<'EOF'
CORE_CLUSTER_WORKERS=1
HLS_SEGMENT_CACHE=off
HLS_CACHE_TTL_SECONDS=15
EOF
sudo docker compose up -d --build
sudo docker compose ps
curl -s http://127.0.0.1:3000/api/public/health | jq '.streamVersion'
```

Esperado: `"2026.08.17-stream-v5-cache"` e container `healthy`.

Repita o `verify-core-stream.mjs` acima → **tem que ser idêntico ao baseline** (flags off = comportamento v4).

```bash
node scripts/verify-core-stream.mjs "<live>" "<filme>" "<serie>" | tee /tmp/v5-flags-off.txt
diff <(grep -o 'status=[0-9]*' /tmp/baseline-v4.txt) <(grep -o 'status=[0-9]*' /tmp/v5-flags-off.txt)
```

Se houver diferença: `git checkout` da versão anterior + `docker compose up -d --build` e pare aqui.

---

## 2. Ativar o multiprocesso (Etapa 1)

```bash
nproc                                     # nº de vCPUs
sed -i 's/^CORE_CLUSTER_WORKERS=.*/CORE_CLUSTER_WORKERS=auto/' .env
sudo docker compose up -d
sudo docker compose logs --tail=30 app | grep cluster
```

Esperado: `[cluster] iniciando N workers (pid primário ...)`.

```bash
curl -s http://127.0.0.1:3000/api/public/health | jq
node scripts/verify-core-stream.mjs "<live>" "<filme>" "<serie>"
```

Live 200, filme/série 206. **Rollback N2 (segundos):** `CORE_CLUSTER_WORKERS=1` + `docker compose up -d`.

---

## 3. Ativar o cache de segmentos HLS (Etapa 3)

```bash
sed -i 's/^HLS_SEGMENT_CACHE=.*/HLS_SEGMENT_CACHE=on/' .env
sed -i 's/^HLS_CACHE_TTL_SECONDS=.*/HLS_CACHE_TTL_SECONDS=15/' .env
sudo docker compose up -d
```

Confirmação de que o cache só pega segmento ao vivo:

```bash
# manifesto ao vivo -> tem que continuar no-cache
curl -sI "<URL_ASSINADA_DO_MANIFESTO>" | grep -iE 'cache-control|x-core-cache|content-type'
# segmento .ts ao vivo -> public, max-age=15 + X-Core-Cache: segment-ttl-15
curl -sI "<URL_ASSINADA_DE_UM_SEGMENTO_TS>" | grep -iE 'cache-control|x-core-cache'
# filme com Range -> 206 e SEM X-Core-Cache
curl -sI -H 'Range: bytes=0-1023' "<URL_ASSINADA_DO_FILME>" | grep -iE 'HTTP/|cache-control|content-range|x-core-cache'
```

Na Cloudflare (proxy de `core.streammonitor.site`), crie **uma** Cache Rule:
- condição: `URI Path contains /api/public/core/stream` **e** `URI Query contains ext=ts` (ou `.m4s`)
- ação: *Eligible for cache*, *Respect origin TTL*
- **Cache Key:** ignorar os parâmetros `sig` e `exp` (senão o hit rate é zero e a assinatura vira parte do objeto)
- Bypass cache quando o header de resposta trouxer `X-Core-Error`.

**Rollback N1 (segundos):** `HLS_SEGMENT_CACHE=off` + `docker compose up -d`.

---

## 4. Confirmação funcional no player real

Antes de qualquer carga, no navegador (`https://<slug>.streammonitor.site`):
1. TV ao vivo em canal comprovadamente OK (Globo SP FHD) — tem que sair do 0:00 em poucos segundos.
2. Filme — play + seek em 3 pontos distintos.
3. Série — retomar episódio.
4. Canal offline conhecido — tem que mostrar o motivo real (`X-Core-Error`), não 502 genérico.

Só siga para a carga se os 4 passarem.

---

## 5. Teste de carga progressivo (um patamar por vez)

Abra **dois terminais** na VPS.

Terminal A (métricas do host, 60 s):

```bash
chmod +x scripts/monitor-core.sh
./scripts/monitor-core.sh 60 /tmp/metrics-50.log
```

Terminal B (carga — comece SÓ com 50):

```bash
node scripts/loadtest-stream.mjs "<URL_ASSINADA_DO_MANIFESTO>" 50 60
```

Repita, um de cada vez, trocando o número e o arquivo de métricas:

```bash
./scripts/monitor-core.sh 60 /tmp/metrics-100.log & node scripts/loadtest-stream.mjs "<URL>" 100 60; wait
./scripts/monitor-core.sh 60 /tmp/metrics-200.log & node scripts/loadtest-stream.mjs "<URL>" 200 60; wait
./scripts/monitor-core.sh 60 /tmp/metrics-500.log & node scripts/loadtest-stream.mjs "<URL>" 500 60; wait
```

> A URL assinada expira (~300 s). Gere uma nova antes de cada patamar abrindo o canal no player e
> copiando a URL do manifesto do DevTools (aba Network).

O loadtest devolve por patamar: total/erros de manifesto e segmento, `taxa_erro_pct`, `p50_ms`,
`p95_ms`, `throughput_mbps`, `cache_hit_pct` e os motivos reais de erro.
O `monitor-core.sh` devolve: `cpu_media`, `cpu_pico`, RAM, `ingress_mbps`, `egress_mbps`, conexões.

**Regra de parada:** se qualquer indicador do patamar cair na coluna "Parar" da tabela do topo,
não execute o próximo. O último patamar totalmente verde é o limite real.

Durante o patamar, mantenha um player humano aberto assistindo — buffering visível conta como falha
mesmo com os números bons.

---

## 6. Conclusão

Preencha e me mande:

| Usuários | CPU média/pico | RAM | Egress Mbps | Erro seg. % | p50/p95 ms | Cache hit % | Buffering? |
|---|---|---|---|---|---|---|---|
| 50 | | | | | | | |
| 100 | | | | | | | |
| 200 | | | | | | | |
| 500 | | | | | | | |

O número seguro é o **maior patamar totalmente verde, com margem de 30%** (ex.: 200 verde e 500
vermelho ⇒ seguro ≈ 140–200). Sem esses números medidos, a estimativa continua sendo a da análise
anterior: **30–50 simultâneos** em processo único sem cache, subindo conforme o cache de segmentos
mostrar hit rate real em TV ao vivo.

## Rollback consolidado

| Nível | Comando | Efeito |
|---|---|---|
| N1 | `HLS_SEGMENT_CACHE=off` + `docker compose up -d` | volta ao `no-cache` |
| N2 | `CORE_CLUSTER_WORKERS=1` + `docker compose up -d` | volta a processo único |
| N3 | `docker compose down && docker tag streammonitor/core:v4-rollback streammonitor/core:latest && docker compose up -d` | volta à imagem v4 |
