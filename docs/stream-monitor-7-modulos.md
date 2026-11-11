# Stream Monitor — 7 módulos: status real

| Módulo | Status |
|---|---|
| 3) Telegram Delivery Guard | **Implementado**: tabela `telegram_outbox` (RLS: só admin lê; escrita só server-side), chave idempotente SHA-256(destino+texto), backoff 30s→1h, respeita `retry_after` (429), dead letter para 400/401/403/404 ou após 6 tentativas, recuperação de itens presos. Worker roda dentro de `/api/public/cron/monitor` (sem cron extra). Tela: `/app/admin/telegram-guard`. Testes: `src/lib/telegram-outbox.test.ts`. Cloudflare Queues: **não provisionado**. |
| 1, 2, 4, 5, 6, 7 | Pendentes — não implementados ainda. |

Integração: `sendToTelegram` em `telegram-alerts.server.ts` tenta o envio direto; em falha transitória entrega à fila e o canal conta como entregue ao guard, evitando reenvio duplicado pelo ciclo antigo.
