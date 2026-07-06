import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANS, type PlanId } from "./payments";

/**
 * Structure prepared for Mercado Pago PIX integration.
 *
 * Currently returns a placeholder payment row so the UI can render the "Aguardando
 * pagamento" state. When the MERCADOPAGO_ACCESS_TOKEN secret is set, replace the
 * placeholder block with a real call to the Mercado Pago /v1/payments endpoint
 * using `payment_method_id: 'pix'` and persist qr code / copy-paste back into
 * the payments row.
 *
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/payment-methods/receiving-payment-by-pix
 */
export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan: z.enum(["monthly", "yearly"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const plan = PLANS.find((p) => p.id === (data.plan as PlanId));
    if (!plan) throw new Error("Plano inválido");

    const { supabase, userId } = context;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // PIX expires in 30 min

    // Insert a pending payment. When Mercado Pago is wired up, populate
    // pix_qr_code / pix_qr_code_base64 / pix_copy_paste and provider_payment_id
    // from the API response before returning.
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        provider: "mercadopago",
        method: "pix",
        status: "pending",
        amount_cents: plan.priceCents,
        currency: "BRL",
        plan: plan.id,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return {
      paymentId: payment.id,
      status: "pending" as const,
      qrCode: null as string | null,
      qrCodeBase64: null as string | null,
      copyPaste: null as string | null,
      expiresAt,
      integrationReady: false, // flips to true once MERCADOPAGO_ACCESS_TOKEN is configured
    };
  });
