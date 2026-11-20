# Stream Monitor — Novo Asaas para ativações de aplicativos

## Escopo e independência

Esta integração foi preparada em 20/11/2026 para uma **nova conta Asaas de outra pessoa, devidamente autorizada**, exclusivamente para receber os pagamentos Pix de ativações de aplicativos AtiveAPP.

Não reutilizar qualquer API Key, cliente, cobrança, Pix ou token de webhook:
- da integração Asaas antiga;
- das assinaturas do Stream Monitor;
- de Mercado Pago;
- da conta AtiveAPP (API Key de fornecedor).

Cloudflare:
- Worker exclusivo: `streammonitor-asaas-ativacoes-nova-conta`
- D1 exclusivo: `streammonitor-asaas-ativacoes-nova-conta` (`89cf8cf4-86e8-4c5c-8e43-bf1f11b549ab`)
- Binding: `NEW_ASAAS_DB`
- Webhook para configurar na NOVA conta Asaas: **https://streammonitor-asaas-ativacoes-nova-conta.victorsampaio133.workers.dev/webhooks/asaas/ativacoes**
- Endpoint de saúde: `https://streammonitor-asaas-ativacoes-nova-conta.victorsampaio133.workers.dev/health`

## Credenciais novas (nunca commitar)
No dashboard Cloudflare > Workers & Pages > `streammonitor-asaas-ativacoes-nova-conta` > Settings > Variables and Secrets:
1. `ASAAS_ATIVACOES_NOVA_API_KEY` — **Secret** com chave de API da nova conta Asaas.
2. `ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN` — **Secret** contendo exatamente o authToken configurado no webhook **dessa mesma conta** (não é a API Key).
3. Ambiente inicial **sandbox**; produção somente após validação da chave, autorização formal da pessoa titular e testes. O padrão está em D1 `merchant_config.environment='sandbox'`.

Não copiar ou acessar credenciais de outro Worker. A nova chave deve ser criada pela pessoa titular da conta ou por quem ela autorizar.

## Fluxo futuro de pagamento (não ativado)
1. Comprador com conta Stream Monitor escolhe aplicativo **com preço definido no Admin** e digita somente MAC; revisa que não há estorno por MAC incorreto.
2. Servidor valida conta, MAC, preço em centavos e uma chave idempotente por pedido. Cria `pix_orders` neste D1, com dados mínimos e `externalReference` exclusivo.
3. Conta Asaas NOVA cria cliente (`POST /v3/customers`), cobrança `PIX` (`POST /v3/payments`) e obtém QR dinâmico (`GET /v3/payments/{id}/pixQrCode`).
4. Mostra Pix Copia e Cola / QR Code no site e Telegram, sem misturar com faturas da assinatura.
5. Webhook Asaas **autenticado** por header `asaas-access-token` e token dedicado. Persistir eventos idempotentes por `event.id`; **não ativar licença só com evento recebido**.
6. Verificar pagamento via GET autenticado ao Asaas **da conta nova**, confirmar `payment.id`, montante, ambiente, `externalReference` e assinatura do pedido; tratar CONFIRMED, RECEIVED, REFUNDED, OVERDUE e chargebacks.
7. Após pagamento efetivamente conciliado, submeter **uma única** solicitação ao fornecedor AtiveAPP com `app_uuid=app_catalog.app_id` e `mac_app`. Esperar resposta da fila da AtiveAPP; conferir o resultado por webhook/histórico, sem duplicar ativação.
8. Tratar timeout, reenvio, falha de webhook, divergências, reembolsos, duplicidade e recuperação de estado.

## Travas que permanecem desligadas
- `merchant_authorized=false`
- `merchant_verified=false`
- `payment_creation_enabled=false`
- `activation_auto_delivery_enabled=false`

Mesmo que alguém coloque uma API Key, o endpoint `POST /v1/pix/create` continua negando cobranças até implementar e homologar a conciliação financeira. O webhook foi implantado em modo **somente registro de metadados**, sem marcar pagamento como quitado nem emitir licença. Sem token secreto da nova conta, ele devolve 503.

## Documentação oficial
- https://docs.asaas.com/docs/criando-um-cliente
- https://docs.asaas.com/reference/criar-nova-cobranca
- https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix
- https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook
