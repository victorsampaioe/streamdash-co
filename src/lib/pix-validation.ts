import { z } from "zod";

export const providerPaymentIdSchema = z.string().regex(/^\d{1,30}$/);

export function validatePixCharge(
  charge: { id: number; external_reference?: string; transaction_amount?: number },
  payment: { id: string; amount_cents: number; provider_payment_id?: string | null },
) {
  providerPaymentIdSchema.parse(String(charge.id));
  if (charge.external_reference !== payment.id) throw new Error("Referência da cobrança divergente");
  if (payment.provider_payment_id && payment.provider_payment_id !== String(charge.id)) {
    throw new Error("Pagamento pertence a outra cobrança");
  }
  if (!Number.isFinite(charge.transaction_amount) ||
    Math.round(Number(charge.transaction_amount) * 100) !== payment.amount_cents) {
    throw new Error("Valor do pagamento diferente da cobrança");
  }
}