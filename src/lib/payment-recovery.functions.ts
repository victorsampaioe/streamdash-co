import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only, per-customer reconciliation. Never grant a subscription based on
 * a screenshot or a manually entered claim of payment: Mercado Pago is queried
 * for every charge before recovery.
 */
export const verifyCustomerPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || !admin) throw new Error("Acesso restrito ao administrador");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getMpToken, syncMpPayment, repairApprovedSubscriptionMismatches, findMpPaymentByReference } = await import("./mercadopago.server");
    if (!getMpToken()) throw new Error("Integração com Mercado Pago não configurada.");

    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id").eq("id", data.userId).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Cliente não encontrado");

    const { data: payments, error: paymentsError } = await supabaseAdmin.from("payments")
      .select("id, plan, payment_type, status, provider_payment_id, raw_payload")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (paymentsError) throw new Error(paymentsError.message);

    let checked = 0;
    let approved = 0;
    let unlinked = 0;
    const errors: string[] = [];
    const subscriptionPlans = new Set(["monthly", "quarterly", "yearly"]);
    for (const pay of payments ?? []) {
      if (!subscriptionPlans.has(String(pay.plan))) continue;
      if (pay.payment_type && pay.payment_type !== "subscription") continue;
      const payload = pay.raw_payload as { id?: number | string } | null;
      try {
        const providerId = pay.provider_payment_id || payload?.id || await findMpPaymentByReference(pay.id);
        if (!providerId) { unlinked++; continue; }
        // syncMpPayment confirms approval directly with Mercado Pago and uses
        // finalize_approved_payment for atomic, idempotent activation.
        const result = await syncMpPayment(String(providerId), pay.id);
        checked++;
        if (result.status === "approved") approved++;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Falha ao consultar pagamento");
      }
    }

    const repair = await repairApprovedSubscriptionMismatches(20, data.userId);
    const { data: sub, error: subError } = await supabaseAdmin.from("subscriptions")
      .select("plan, status, expires_at").eq("user_id", data.userId).maybeSingle();
    if (subError) throw new Error(subError.message);
    const active = sub?.status === "active" && !!sub.expires_at &&
      new Date(sub.expires_at).getTime() > Date.now();

    return {
      checked,
      approved,
      unlinked,
      repaired: repair.repaired,
      needsReview: repair.review,
      failures: repair.failed + errors.length,
      errors: errors.slice(0, 3),
      active: Boolean(active),
      plan: active ? sub?.plan ?? null : null,
      expiresAt: active ? sub?.expires_at ?? null : null,
      message: active ? "Assinatura ativa, confirmada no banco." :
        approved ? "Pagamento aprovado encontrado, mas a ativação exige revisão." :
        unlinked ? "Há cobrança sem identificador do Mercado Pago. Verifique a transação." :
        "Não foi encontrado pagamento aprovado nas cobranças vinculadas a este cliente.",
    };
  });
