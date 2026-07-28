## Sistema de Indicação Premiada — R$10 por assinatura via PIX

Substitui o sistema atual (que dava +1 mês ao indicador). Mantém: 2 dias de trial pro indicado (era 10, muda pra 2), código exclusivo por usuário, link `?ref=CODIGO`.

### 1. Banco de dados (migração)

**Alterar `referrals`** — adicionar campos de recompensa/pagamento:
- `reward_cents int` (default 1000 = R$10)
- `status text` (`pending` | `trial_active` | `subscribed` | `requested` | `approved` | `paid` | `cancelled`)
- `subscribed_at`, `requested_at`, `approved_at`, `paid_at timestamptz`
- `pix_key text`, `pix_type text` (cpf/phone/email/random), `pix_name text`
- `approved_by uuid` (admin)
- `payout_request_id uuid` (agrupa várias referrals numa mesma solicitação)

**Nova tabela `payout_requests`**:
- `id`, `user_id`, `amount_cents`, `pix_type`, `pix_key`, `pix_name`
- `status` (`requested` | `approved` | `paid` | `rejected`)
- `requested_at`, `approved_at`, `paid_at`, `approved_by`, `admin_note`
- RLS: dono lê/insere próprio; admin lê/atualiza tudo

**Alterar `profiles.signup_bonus_days`** default 2 (era 10). Atualizar registros existentes onde valor = 10 → 2.

**Trigger `grant_referral_reward`** — substituir: quando `payments.status='approved'` E é a 1ª assinatura do indicado, marcar `referrals.status='subscribed'`, setar `subscribed_at`, `reward_cents=1000`. **Não** estender mais a assinatura do indicador.

**RPCs**:
- `get_referral_balance(_user_id)` → `{available_cents, pending_cents, paid_cents, total_referrals, in_trial, subscribed_count}`
- `request_payout(_pix_type, _pix_key, _pix_name)` → cria `payout_request`, marca referrals elegíveis como `requested`
- `admin_approve_payout(_id)` / `admin_mark_paid(_id)` / `admin_reject_payout(_id, _note)` — checam `has_role(admin)`
- `get_admin_payout_requests()` → lista com dados do usuário e nº de indicações

### 2. Frontend — usuário (`/app/referrals`)

Reescrever a página com:
- **Banner promocional** 🚨💸 no topo (gradient, destaque)
- **Cards**: Indicações, Em Teste, Assinaram, Saldo Disponível (R$), Já Recebido (R$)
- **Bloco código + link** (copiar código / copiar link — link já usa `streammonitor.site`)
- **Lista de indicados** com status colorido (Teste / Assinou R$10 / Pago)
- **Botão "Solicitar Pagamento"** habilitado se `available_cents >= 1000`
- **Modal PIX**: tipo (select), chave (input), nome (input), resumo do valor, aviso "até 2 dias úteis", botão confirmar
- **Histórico de solicitações** (timeline: Solicitado → Aprovado → PIX enviado)

Notificações via `toast` nos eventos client-side + Telegram (backend) quando existir chat_id.

### 3. Frontend — admin (`/app/admin` → nova aba/seção "Indicações")

- Cards: Total Indicações, Em Teste, Assinaram, Recompensas Pendentes, PIX Solicitados, PIX Pagos
- Tabela de `payout_requests` com status `requested`: Usuário, nº indicações válidas, valor, PIX (tipo+chave+nome), data
- Ações: **Aprovar** / **Recusar** / **Marcar como Pago** (após aprovado)
- Ao expandir linha: nome, email, telefone do solicitante

### 4. Backend — server functions

`src/lib/referrals.functions.ts`:
- `getMyReferralSummary` (autenticado) — chama RPC
- `requestPayout({pixType, pixKey, pixName})` — valida saldo, cria request
- `adminListPayoutRequests`, `adminApprovePayout`, `adminMarkPaid`, `adminRejectPayout`

Telegram admin (`ADMIN_TELEGRAM_CHAT_ID`) recebe aviso quando alguém solicita PIX.
Telegram do usuário recebe aviso quando: indicado assina (ganhou R$10), PIX aprovado, PIX pago.

### 5. Cadastro (`/auth`)

- Trocar mensagem: "🎁 Você ganhou **2 dias** extras de teste"
- Ler `?ref=` e travar o campo (readOnly) quando vier pela URL

### 6. Ajustes no fluxo de assinatura

- Remover extensão de +30 dias no `grant_referral_reward` (não é mais mês grátis; é R$10 PIX)
- Manter desconto de 10% na 1ª compra do indicado? **Remover** — a proposta agora é 2 dias trial + R$10 pro indicador. Confirmar na implementação removendo `REFERRAL_FIRST_PURCHASE_DISCOUNT` do `createPixPayment`.

### Detalhes técnicos

- Recompensa fixa em `reward_cents` na referral (não hardcoded) para permitir promoções futuras
- Uma referral só entra num `payout_request` quando status = `subscribed` e `payout_request_id IS NULL`
- Regra anti-fraude: se `payments` do indicado tiver refund futuro → trigger marca referral `cancelled` e subtrai do saldo (fora do escopo desta 1ª entrega — anotar como TODO)
- GRANTs em todas as novas tabelas/funções conforme regras Cloud

### O que **não** muda
- Geração do código (`generate_referral_code`)
- Código admin fixo `REGPF89U` do Victor
- Estrutura de auth / RLS existente
