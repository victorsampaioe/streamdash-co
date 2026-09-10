# Fluxo comercial automático — STREAM MONITOR API

## Auditoria do fluxo atual

- A cobrança PIX já é criada por `createPixPayment`, usando a credencial atual do Mercado Pago e gravando em `payments`.
- O QR Code atual é exibido pelo mesmo `PixDialog`, que consulta o pagamento a cada 3 segundos.
- A confirmação acontece pelo webhook do Mercado Pago e também por reconciliação periódica de cobranças pendentes.
- Toda aprovação converge para a função protegida `finalize_approved_payment`, que hoje ativa planos Stream Monitor ou adiciona créditos.
- A API comercial já possui `api_plans`, `api_subscriptions`, limites, chaves, escopos, consumo e webhooks, mas os quatro planos estão sem preço, inativos e ocultos.
- Hoje a ativação da API é manual pelo administrador e não existe vínculo operacional com a assinatura principal.

## Decisão de arquitetura

Não será criado outro sistema de pagamento. A compra da API usará o mesmo `payments`, a mesma cobrança PIX, o mesmo webhook, a mesma consulta de status e a mesma reconciliação já existentes.

A distinção será feita por `payment_type = api_subscription` e por uma referência direta ao plano em `api_plans`. Isso evita misturar os identificadores da API com o enum dos planos normais.

## Implementação

### 1. Preparar planos e pagamentos

- Ativar e publicar os planos:
  - API PRO — R$ 49,90/mês
  - API BUSINESS — R$ 99,90/mês
  - API AI — R$ 149,90/mês
  - ENTERPRISE — R$ 249,90/mês
- Adicionar a categoria `api_subscription` ao pagamento existente.
- Vincular cada cobrança API ao respectivo registro de `api_plans`.
- Manter cobranças pendentes idempotentes, sem duplicar QR Codes válidos.

### 2. Validar elegibilidade antes da compra

- Permitir contratação somente quando a conta Stream Monitor estiver ativa.
- Para clientes: exigir assinatura `active` ou `trial`, ainda válida.
- Para revendedores: considerar elegível quando houver créditos acima de zero, conforme definido.
- Resolver a conta proprietária corretamente para impedir que subcontas comprem ou vendam planos em nome de terceiros.
- Revendedores poderão contratar somente para uso próprio; não haverá função para criar, revender ou atribuir planos API a outros usuários.

### 3. Ativação automática e idempotente

- Estender `finalize_approved_payment` para reconhecer pagamentos API.
- Após confirmação, criar ou renovar `api_subscriptions` com `status = active`.
- Em renovação, somar um mês à validade atual quando ela ainda estiver vigente; caso contrário, contar um mês a partir da confirmação.
- Aplicar automaticamente limites e recursos do plano vinculado.
- Preservar webhook, consulta manual e reconciliação periódica como caminhos equivalentes de confirmação.
- Ajustar a rotina administrativa de reconciliação para também recuperar ativações API perdidas, sem exigir aprovação manual.

### 4. Vínculo e suspensão automática

- Registrar em `api_subscriptions` o motivo e a data de suspensão vinculada.
- Quando o Stream Monitor ficar inativo, alterar a API para `suspended` com o motivo `main_subscription_inactive`.
- Bloquear autenticação de API, criação de chaves e webhooks enquanto suspensa.
- Exibir: “Sua API foi pausada porque sua assinatura Stream Monitor está inativa.”
- Quando o Stream Monitor voltar a ficar ativo, reativar automaticamente somente se:
  - a assinatura API ainda estiver dentro da validade; e
  - a suspensão tiver sido causada pela assinatura principal.
- Não reativar assinaturas API canceladas, expiradas ou suspensas por outro motivo.
- Executar a sincronização nas mudanças da assinatura principal e reforçá-la nos pontos de acesso da API.

### 5. Experiência em API & Integrações

- Substituir o aviso de ativação manual pela grade dos quatro planos.
- Reutilizar o diálogo PIX atual.
- Mostrar pagamento pendente e acompanhar confirmação automática.
- Após aprovação, atualizar a tela e liberar criação/cópia da API Key.
- Mostrar plano, status, consumo, limite, validade e próxima renovação.
- Manter documentação disponível para consulta; ações e recursos contratados respeitarão o status e as capacidades do plano.
- Exibir estados claros para assinatura principal inativa, API suspensa, API expirada e pagamento pendente.

### 6. Administração

- Remover a ativação manual de assinaturas API do painel administrativo.
- Manter apenas visão operacional de planos, assinaturas e métricas.
- Não expor criação de planos API para revendedores.

## Detalhes técnicos

- Migration aditiva para `payments.api_plan_id`, novo valor de `payment_type` e metadados de suspensão em `api_subscriptions`.
- Atualização transacional e idempotente de `finalize_approved_payment`, mantendo execução exclusiva do backend.
- Uma função central de elegibilidade aplicará a mesma regra a compra, criação de chave, webhooks e autenticação da API.
- O gateway continuará derivando escopos e limites exclusivamente do plano ativo; nenhuma tabela será exposta diretamente.
- A notificação de pagamento distinguirá assinatura Stream Monitor, créditos, loja e assinatura API.

## Validação

- Compra bloqueada sem Stream Monitor ativo.
- Revendedor com créditos consegue comprar para a própria conta.
- PIX é gerado pelo fluxo atual e pagamento aprovado ativa a API sem administrador.
- Repetição do webhook não duplica nem estende a assinatura duas vezes.
- Renovação válida estende a data corretamente.
- Expiração do Stream Monitor suspende a API e bloqueia chaves existentes.
- Reativação do Stream Monitor restaura a API ainda válida.
- Plano vencido ou suspensão manual não é reativado indevidamente.
- Tela mostra planos, pagamento, status, consumo, chave e renovação em desktop e mobile.
