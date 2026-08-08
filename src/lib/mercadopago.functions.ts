import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANS, effectivePriceCents, type PlanId } from "./payments";

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ 
    plan: z.string().optional(), 
    storeProductId: z.string().optional(),
    paymentType: z.enum(["subscription", "store"]).optional()
  }).parse(input))
  .handler(async ({ data, context }) => {
    let amountCents: number;
    let description: string;
    let planId = data.plan as PlanId | undefined;
    let storeProductId = data.storeProductId;
    let paymentType = data.paymentType || (storeProductId ? "store" : "subscription");


    if (planId) {
      const standardPlan = PLANS.find((p) => p.id === planId);
      if (standardPlan) {
        amountCents = effectivePriceCents(standardPlan);
        description = `StreamMonitor — Plano ${standardPlan.name}`;
      } else if (planId.startsWith("credits_")) {
        const packs: Record<string, { price: number; label: string }> = {
          credits_10: { price: 10000, label: "10 créditos" },
          credits_30: { price: 27000, label: "30 créditos" },
          credits_40: { price: 35000, label: "40 créditos" },
        };
        const pack = packs[planId];
        if (!pack) throw new Error("Pacote de créditos inválido");
        amountCents = pack.price;
        description = `StreamMonitor — ${pack.label}`;
      } else {
        throw new Error("Plano inválido");
      }
    } else if (storeProductId) {
      const { data: product, error: productError } = await context.supabase
        .from("store_products")
        .select("name, price")
        .eq("id", storeProductId)
        .single();
      
      if (productError || !product) throw new Error("Produto da loja não encontrado");
      amountCents = Math.round(product.price * 100);
      description = `StreamMonitor — ${product.name}`;
    } else {
      throw new Error("Informe o plano ou produto");
    }

    const { supabase, userId, claims } = context;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // PIX 30min
    const discountApplied = false;

    // Reuse a still-valid charge.
    const { data: existing } = await supabase
      .from("payments")
      .select("id, amount_cents, expires_at, pix_copy_paste, pix_qr_code")
      .eq("user_id", userId)
      .eq(storeProductId ? "store_product_id" : "plan", (storeProductId || planId)!)
      .eq("status", "pending")
      .eq("amount_cents", amountCents)
      .gt("expires_at", new Date().toISOString())
      .not("pix_qr_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingPixCode = typeof existing?.pix_copy_paste === "string"
      ? existing.pix_copy_paste.trim()
      : typeof existing?.pix_qr_code === "string"
        ? existing.pix_qr_code.trim()
        : "";

    if (existing && existingPixCode) {
      return {
        paymentId: existing.id,
        status: "pending" as const,
        copyPaste: existingPixCode,
        expiresAt: existing.expires_at ?? expiresAt,
        integrationReady: true,
        amountCents: existing.amount_cents,
        discountApplied,
      };
    }

    // 1) Create pending payment row
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        provider: "mercadopago",
        method: "pix",
        status: "pending",
        amount_cents: amountCents,
        currency: "BRL",
        plan: (planId || null) as any,
        store_product_id: storeProductId || null,
        payment_type: paymentType as any,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) {
      console.error("[mercadopago] Failed to insert payment row:", error);
      throw new Error(`Erro ao salvar pagamento no banco: ${error.message}`);
    }

    // 2) Try to create real MP PIX charge
    const { getMpToken, createMpPixCharge } = await import("./mercadopago.server");
    if (!getMpToken()) {
      return {
        paymentId: payment.id,
        status: "pending" as const,
        copyPaste: null as string | null,
        expiresAt,
        integrationReady: false,
        amountCents,
        discountApplied,
      };
    }

    const siteUrl = process.env.SITE_URL || "https://streammonitor.site";
    const notificationUrl = `${siteUrl}/api/public/webhooks/mercadopago`;
    const payerEmail = (claims?.email as string | undefined) || `user-${userId}@streammonitor.site`;

    try {
      console.log("[mercadopago] creating charge with params:", {
        amountCents,
        description,
        payerEmail,
        externalReference: payment.id,
        expiresAt,
        notificationUrl
      });

      const charge = await createMpPixCharge({
        amountCents,
        description: `${description}${discountApplied ? " (desconto indicação)" : ""}`,
        payerEmail,
        externalReference: payment.id,
        expiresAt,
        notificationUrl,
      });

      console.log("[mercadopago] charge created successfully:", charge.id);

      const td = charge.point_of_interaction?.transaction_data;
      const pixCopyPaste = typeof td?.qr_code === "string" ? td.qr_code.trim() : "";
      if (!pixCopyPaste) {
        console.error("[mercadopago] missing qr_code in response", charge);
        throw new Error("O Mercado Pago não retornou um código PIX válido. Resposta: " + JSON.stringify(charge));
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("payments")
        .update({
          provider_payment_id: String(charge.id),
          pix_qr_code: pixCopyPaste,
          pix_qr_code_base64: null,
          pix_copy_paste: pixCopyPaste,
          raw_payload: charge as any,
        })
        .eq("id", payment.id);

      return {
        paymentId: payment.id,
        status: "pending" as const,
        copyPaste: pixCopyPaste,
        expiresAt,
        integrationReady: true,
        amountCents,
        discountApplied,
      };
    } catch (e) {
      console.error("[mercadopago] createPixPayment internal error:", e);
      throw new Error(e instanceof Error ? `Erro MP: ${e.message}` : "Falha ao gerar cobrança PIX");
    }
  });

export const getPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("payments")
      .select("id, status, paid_at, plan, provider_payment_id")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!row || row.status === "approved" || !row.provider_payment_id) return row;

    try {
      const { syncMpPayment } = await import("./mercadopago.server");
      const synced = await syncMpPayment(row.provider_payment_id);
      return { ...row, status: synced.status, paid_at: synced.paidAt };
    } catch (error) {
      console.error("[mercadopago] payment status sync failed:", error);
      return row;
    }
  });
