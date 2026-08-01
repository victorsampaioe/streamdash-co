# Próxima versão — Otimização e Escalabilidade

Objetivo: reduzir o crescimento do banco (~420 MB hoje, 90% em séries temporais) e acelerar as consultas, sem interromper o desenvolvimento das funcionalidades.

## Ordem acordada

1. Finalizar Ranking IPTV + Detector de Filmes
2. Testar com vários servidores reais
3. Medir crescimento do banco
4. Executar esta atualização de performance

## Baseline atual do banco

| Tabela | Linhas | Tamanho |
|---|---|---|
| region_checks | 410 mil | 169 MB |
| kuma_heartbeats | 668 mil | 128 MB |
| checks | 410 mil | 77 MB |
| dns_snapshots | 14,8 mil | 28 MB |
| iptv_catalog_items | 58 mil | 18 MB |

## Escopo da otimização

### 1. Retenção e limpeza automática
- Manter dados brutos por 7 dias em `region_checks`, `kuma_heartbeats`, `checks`
- Job de limpeza via `pg_cron` (diário, madrugada)
- Purga de `iptv_catalog_changes` com mais de 90 dias

### 2. Agregação minuto → hora → dia
- Tabelas de rollup: `checks_hourly`, `checks_daily`, `region_checks_hourly`
- Métricas: uptime %, latência média/p95/máx, contagem de quedas
- Gráficos passam a ler rollups quando o período for maior que 48 h

### 3. Não duplicar catálogo
- Consolidar itens por `title_key` entre servidores
- Evitar reescrita de linhas inalteradas no upsert (diff por hash já existente)

### 4. Índices
- `(server_id, checked_at DESC)` em `checks`, `region_checks`, `kuma_heartbeats`
- `(server_id, kind, removed_at)` em `iptv_catalog_items`
- `(detected_at DESC, action)` em `iptv_catalog_changes`

### 5. Ranking em cache
- Tabela materializada de ranking (IPTV, estabilidade, hub), atualizada por cron a cada 10 min
- Páginas leem a tabela pronta em vez de recalcular a cada acesso

### 6. Fila de processamento
- Sincronizações IPTV/DNS entram em fila com limite de concorrência
- Evita picos de CPU e timeouts no cron único

### 7. Compressão de histórico
- Histórico antigo de `dns_snapshots` reduzido a resumo diário (JSON compacto)

## Detalhes técnicos

- Toda mudança de schema via migração, com `GRANT` e RLS mantidos
- Rollups populados por funções SQL agendadas com `pg_cron`, sem depender do worker
- Leitura dos rollups encapsulada em funções `SECURITY DEFINER` já no padrão do projeto
- Nenhuma alteração de UX visível além de gráficos mais rápidos
