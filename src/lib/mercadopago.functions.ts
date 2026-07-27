import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANS, type PlanId } from "./payments";

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan: z.enum(["monthly", "yearly"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const plan = PLANS.find((p) => p.id === (data.plan as PlanId));
    if (!plan) throw new Error("Plano inválido");

    const { supabase, userId, claims } = context;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // PIX 30min

    // 1) Create pending payment row
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

    // 2) Try to create real MP PIX charge
    const { getMpToken, createMpPixCharge } = await import("./mercadopago.server");
    if (!getMpToken()) {
      return {
        paymentId: payment.id,
        status: "pending" as const,
        qrCode: null as string | null,
        qrCodeBase64: null as string | null,
        copyPaste: null as string | null,
        expiresAt,
        integrationReady: false,
      };
    }

    const siteUrl = process.env.SITE_URL || "https://streammonitor.site";
    const notificationUrl = `${siteUrl}/api/public/webhooks/mercadopago`;
    const payerEmail = (claims?.email as string | undefined) || `user-${userId}@streammonitor.site`;

    try {
      const charge = await createMpPixCharge({
        amountCents: plan.priceCents,
        description: `StreamMonitor — Plano ${plan.name}`,
        payerEmail,
        externalReference: payment.id,
        expiresAt,
        notificationUrl,
      });

      const td = charge.point_of_interaction?.transaction_data;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("payments")
        .update({
          provider_payment_id: String(charge.id),
          pix_qr_code: td?.qr_code ?? null,
          pix_qr_code_base64: td?.qr_code_base64 ?? null,
          pix_copy_paste: td?.qr_code ?? null,
          raw_payload: charge as unknown as Record<string, unknown>,
        })
        .eq("id", payment.id);

      return {
        paymentId: payment.id,
        status: "pending" as const,
        qrCode: td?.qr_code ?? null,
        qrCodeBase64: td?.qr_code_base64 ?? null,
        copyPaste: td?.qr_code ?? null,
        expiresAt,
        integrationReady: true,
      };
    } catch (e) {
      console.error("[mercadopago] createPixPayment failed:", e);
      throw new Error(e instanceof Error ? e.message : "Falha ao gerar cobrança PIX");
    }
  });

// Client-callable status poll — lets the UI check whether the PIX was paid.
export const getPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("payments")
      .select("id, status, paid_at, plan")
      .eq("id", data.paymentId)
      .maybeSingle();
    return row;
  });
