import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANS, effectivePriceCents, type PlanId } from "./payments";

export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ 
    plan: z.string().optional().nullable(), 
    storeProductId: z.string().optional().nullable(),
    apiPlanCode: z.enum(["api_pro", "api_business", "api_ai", "enterprise"]).optional().nullable(),
    paymentType: z.enum(["subscription", "store", "api_subscription"]).optional().nullable()
  }).parse(input))
  .handler(async ({ data, context }) => {
    let amountCents: number;
    let description: string;
    let planId = (data.plan || undefined) as PlanId | undefined;
    let storeProductId = data.storeProductId || undefined;
    const apiPlanCode = data.apiPlanCode || undefined;
    let apiPlanId: string | undefined;
    let paymentType = data.paymentType || (apiPlanCode ? "api_subscription" : storeProductId ? "store" : "subscription");

    if (apiPlanCode) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: owner } = await context.supabase.rpc("get_owner_account_id", { _user_id: context.userId });
      if ((owner ?? context.userId) !== context.userId) {
        throw new Error("Somente o titular da conta pode contratar a STREAM MONITOR API.");
      }
      const { data: eligible } = await supabaseAdmin.rpc("stream_monitor_account_active", { _account_id: context.userId });
      if (!eligible) {
        throw new Error("Você precisa de uma assinatura Stream Monitor ativa para contratar a API.");
      }
      const { data: apiPlan, error: apiPlanError } = await supabaseAdmin
        .from("api_plans")
        .select("id, name, monthly_price_cents")
        .eq("code", apiPlanCode)
        .eq("is_active", true)
        .eq("is_public", true)
        .single();
      if (apiPlanError || !apiPlan || apiPlan.monthly_price_cents == null) throw new Error("Plano API indisponível.");
      apiPlanId = apiPlan.id;
      amountCents = apiPlan.monthly_price_cents;
      description = `StreamMonitor API — ${apiPlan.name}`;
      planId = undefined;
      storeProductId = undefined;
      paymentType = "api_subscription";
    } else if (planId) {
      const standardPlan = PLANS.find((p) => p.id === planId);
      if (standardPlan) {
        amountCents = effectivePriceCents(standardPlan);
        description = `StreamMonitor — Plano ${standardPlan.name}`;
      } else if (planId.startsWith("credits_")) {
        const amount = parseInt(planId.replace("credits_", ""));
        if (isNaN(amount)) throw new Error("Pacote de créditos inválido");
        
        const pricePerCredit = amount >= 50 ? 5.00 : 6.00;
        amountCents = Math.round(amount * pricePerCredit * 100);
        description = `StreamMonitor — ${amount} créditos`;
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
    const eligibleReferralDiscount = paymentType === "subscription" && ["monthly", "quarterly", "yearly"].includes(planId ?? "");
    const grossAmountCents = amountCents;
    let referralDiscountCents = 0;
    let discountApplied = false;

    // Reuse a still-valid charge.
    let existingQuery = supabase
      .from("payments")
      .select("id, amount_cents, referral_discount_cents, expires_at, pix_copy_paste, pix_qr_code")
      .eq("user_id", userId)
      .eq("payment_type", paymentType)
      .eq("status", "pending")
      .eq(eligibleReferralDiscount ? "gross_amount_cents" : "amount_cents", grossAmountCents)
      .gt("expires_at", new Date().toISOString())
      .not("pix_qr_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (apiPlanId) existingQuery = existingQuery.eq("api_plan_id", apiPlanId);
    else if (storeProductId) existingQuery = existingQuery.eq("store_product_id", storeProductId);
    else if (planId) existingQuery = existingQuery.eq("plan", planId);
    const { data: existing } = await existingQuery.maybeSingle();

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
        referralDiscountCents: existing.referral_discount_cents ?? 0,
        discountApplied: (existing.referral_discount_cents ?? 0) > 0,
      };
    }

    // 1) Create pending payment row
    const insertData: any = {
      user_id: userId,
      provider: "mercadopago",
      method: "pix",
      status: "pending",
      amount_cents: amountCents,
      gross_amount_cents: eligibleReferralDiscount ? grossAmountCents : null,
      referral_discount_cents: 0,
      currency: "BRL",
      store_product_id: storeProductId || null,
      api_plan_id: apiPlanId || null,
      payment_type: paymentType as any,
      expires_at: expiresAt,
    };
    
    // Only include plan if it's not a store product
    if (!storeProductId && planId) {
      insertData.plan = planId;
    } else {
      insertData.plan = null;
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .insert(insertData)
      .select()
      .single();
    if (error) {
      console.error("[mercadopago] Failed to insert payment row:", error);
      throw new Error(`Erro ao salvar pagamento no banco: ${error.message}`);
    }

    // Reserva atomicamente o saldo de indicação. O saldo só é consumido
    // quando a cobrança for aprovada; expiração ou cancelamento o libera.
    if (eligibleReferralDiscount) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: discountResult, error: discountError } = await supabaseAdmin.rpc("reserve_referral_discount", {
        _payment_id: payment.id,
      });
      if (discountError) throw new Error(`Não foi possível aplicar o saldo de indicação: ${discountError.message}`);
      const discounted = discountResult?.[0];
      referralDiscountCents = discounted?.discount_cents ?? 0;
      amountCents = discounted?.amount_to_pay_cents ?? grossAmountCents;
      discountApplied = referralDiscountCents > 0;
      if (amountCents === 0) {
        const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc("finalize_referral_credit_payment", {
          _payment_id: payment.id,
        });
        if (finalizeError || !finalized?.[0]?.applied) {
          throw new Error(finalizeError?.message || "Não foi possível confirmar a renovação com saldo.");
        }
        return {
          paymentId: payment.id,
          status: "approved" as const,
          copyPaste: null,
          expiresAt,
          integrationReady: true,
          amountCents: 0,
          referralDiscountCents,
          discountApplied: true,
          creditOnly: true,
        };
      }
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
        referralDiscountCents,
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
      const { error: saveChargeError } = await supabaseAdmin
        .from("payments")
        .update({
          provider_payment_id: String(charge.id),
          pix_qr_code: pixCopyPaste,
          pix_qr_code_base64: null,
          pix_copy_paste: pixCopyPaste,
          raw_payload: charge as any,
        })
        .eq("id", payment.id);
      if (saveChargeError) {
        console.error("[mercadopago] Falha ao vincular cobrança", payment.id, saveChargeError);
        throw new Error("O Pix foi criado, mas não pôde ser vinculado à sua conta. Contate o suporte antes de pagar.");
      }

      return {
        paymentId: payment.id,
        status: "pending" as const,
        copyPaste: pixCopyPaste,
        expiresAt,
        integrationReady: true,
        amountCents,
        referralDiscountCents,
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
    if (!row) return row;

    try {
      const { syncMpPayment, findMpPaymentByReference, repairApprovedSubscriptionMismatches } = await import("./mercadopago.server");
      const providerId = row.provider_payment_id || await findMpPaymentByReference(row.id);
      if (!providerId) return row;
      const synced = await syncMpPayment(providerId, row.id);
      if (synced.status === "approved") await repairApprovedSubscriptionMismatches(20, context.userId);
      return { ...row, status: synced.status, paid_at: synced.paidAt };
    } catch (error) {
      console.error("[mercadopago] payment status sync failed:", error);
      return row;
    }
  });
