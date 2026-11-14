// Server-only helpers for Mercado Pago PIX integration.
// Do NOT import this file from client bundles.
import { providerPaymentIdSchema, validatePixCharge } from "./pix-validation";

const MP_BASE = "https://api.mercadopago.com";

export type MpPixPayment = {
  id: number;
  status: string;
  external_reference?: string;
  status_detail?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  date_of_expiration?: string;
  transaction_amount?: number;
};

export function getMpToken(): string | null {
  return process.env.MERCADOPAGO_ACCESS_TOKEN ?? null;
}

export async function createMpPixCharge(params: {
  amountCents: number;
  description: string;
  payerEmail: string;
  externalReference: string;
  expiresAt: string;
  notificationUrl: string;
}): Promise<MpPixPayment> {
  const token = getMpToken();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");

  const body = {
    transaction_amount: Number((Number(params.amountCents || 0) / 100).toFixed(2)),
    description: params.description,
    payment_method_id: "pix",
    external_reference: params.externalReference,
    notification_url: params.notificationUrl,
    date_of_expiration: params.expiresAt,
    payer: { email: params.payerEmail },
  };

  const res = await fetch(`${MP_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": params.externalReference,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mercado Pago error [${res.status}]: ${text}`);
  }
  return (await res.json()) as MpPixPayment;
}

export async function fetchMpPayment(paymentId: string | number): Promise<MpPixPayment> {
  providerPaymentIdSchema.parse(String(paymentId));
  const token = getMpToken();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mercado Pago error [${res.status}]: ${text}`);
  }
  return (await res.json()) as MpPixPayment;
}

export function mapMpStatus(status: string): "pending" | "approved" | "rejected" | "cancelled" | "refunded" {
  switch (status) {
    case "approved":
      return "approved";
    // "authorized" means authorized but not captured: do not activate a subscription.
    case "authorized":
      return "pending";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending";
  }
}

export async function syncMpPayment(paymentId: string | number, expectedPaymentId?: string) {
  const mp = await fetchMpPayment(paymentId);
  const status = mapMpStatus(mp.status);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Priorize a referência interna, mas recupere pelo ID do provedor se vier ausente
  // ou inválida. Não vincule pagamentos de outras cobranças.
  let row: any = null;
  if (mp.external_reference && /^[0-9a-f-]{36}$/i.test(mp.external_reference)) {
    const { data, error } = await supabaseAdmin.from("payments")
      .select("*").eq("id", mp.external_reference).maybeSingle();
    if (error) throw new Error(error.message);
    row = data;
  }
  if (!row) {
    const { data, error } = await supabaseAdmin.from("payments")
      .select("*").eq("provider_payment_id", String(mp.id)).maybeSingle();
    if (error) throw new Error(error.message);
    row = data;
  }
  if (!row || (row.provider_payment_id && row.provider_payment_id !== String(mp.id))) {
    throw new Error("Cobrança não encontrada ou ID divergente");
  }
  if (expectedPaymentId && row.id !== expectedPaymentId) {
    throw new Error("Pagamento pertence a outra cobrança; nenhuma ativação foi realizada");
  }

  // Validação também para cobranças antigas marcadas como aprovadas no banco.
  validatePixCharge(mp, row);
  if (row.status === "approved") {
    // Estorno comprovado pelo provedor: reverte as comissões ligadas a
    // esta cobrança no trigger do banco. Não inventa comissões negativas.
    if (status === "refunded") {
      const { error: refundError } = await supabaseAdmin.from("payments")
        .update({ status: "refunded", raw_payload: mp as any })
        .eq("id", row.id).eq("status", "approved");
      if (refundError) throw new Error(refundError.message);
    }
    return {
      paymentId: row.id, status, paidAt: row.paid_at,
      subscriptionExpiresAt: null, newlyApproved: false,
    };
  }

  if (status === "approved") {
    const paidAt = new Date().toISOString();
    const { data: finalized, error } = await supabaseAdmin.rpc("finalize_approved_payment", {
      _payment_id: row.id,
      _provider_payment_id: String(mp.id),
      _raw_payload: mp as any,
      _paid_at: paidAt,
    });
    if (error) throw new Error(error.message);
    // Inform the customer only after the provider-approved payment has been
    // applied to the subscription. Telegram failure must not roll back payment.
    if(finalized?.[0]?.applied === true && row.payment_type === "subscription"){
      try{
        const {enqueueTelegramPaymentApproved}=await import("./telegram-billing.server");
        await enqueueTelegramPaymentApproved({
          userId:row.user_id,paymentId:row.id,plan:row.plan,
          amountCents:row.amount_cents,expiresAt:finalized?.[0]?.expires_at??null,
        });
      }catch(notifyError){
        console.error("[mercadopago] private Telegram confirmation deferred",
          notifyError instanceof Error?notifyError.name:"unknown");
      }
    }
    return {
      paymentId: row.id,
      status,
      paidAt,
      subscriptionExpiresAt: finalized?.[0]?.expires_at ?? null,
      newlyApproved: finalized?.[0]?.applied === true,
    };
  }

  const { error } = await supabaseAdmin
    .from("payments")
    .update({
      status,
      provider_payment_id: String(mp.id),
      raw_payload: mp as any,
    })
    .eq("id", row.id)
    .neq("status", "approved");
  if (error) throw new Error(error.message);

  return { paymentId: row.id, status, paidAt: row.paid_at, subscriptionExpiresAt: null, newlyApproved: false };
}

/**
 * Safety net: re-checks recent pending PIX charges directly with Mercado Pago
 * and finalizes any that were already paid (e.g. when the webhook was missed).
 */
export async function reconcilePendingPayments(limit = 40) {
  if (!getMpToken()) return { checked: 0, approved: 0, failed: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error: queryError } = await supabaseAdmin
    .from("payments")
    .select("id, provider_payment_id")
    .eq("status", "pending")
    .gt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (queryError) throw new Error(queryError.message);

  let approved = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      const providerId = row.provider_payment_id || await findMpPaymentByReference(row.id);
      if (!providerId) continue;
      const res = await syncMpPayment(providerId, row.id);
      if (res.status === "approved") approved++;
    } catch (e) {
      failed++;
      console.error("[mercadopago] reconcile failed for", row.id, e);
    }
  }
  return { checked: rows?.length ?? 0, approved, failed };
}

/** Recovers charges created before the provider ID could be saved locally. */
export async function findMpPaymentByReference(paymentId: string): Promise<string | null> {
  const token = getMpToken();
  if (!token) throw new Error("Integração PIX indisponível");
  const query = new URLSearchParams({ external_reference: paymentId, sort: "date_created", criteria: "desc", limit: "10" });
  const response = await fetch(`${MP_BASE}/v1/payments/search?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Não foi possível consultar a cobrança PIX");
  const result = await response.json() as { results?: MpPixPayment[] };
  const matches = (result.results ?? []).filter(item => item.external_reference === paymentId);
  // Never guess between multiple paid transactions.
  const approved = matches.filter(item => item.status === "approved");
  if (approved.length > 1) throw new Error("Mais de um pagamento encontrado; revisão necessária");
  const charge = approved[0] ?? matches[0];
  return charge ? providerPaymentIdSchema.parse(String(charge.id)) : null;
}

/**
 * Recupera uma assinatura não ativada mesmo quando o pagamento já está marcado
 * como aprovado. Só considera pagamentos recentes e confirma o status no
 * Mercado Pago antes de conceder acesso. Nunca adiciona créditos.
 */
export async function repairApprovedSubscriptionMismatches(limit = 50, userId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let approvedQuery = supabaseAdmin.from("payments")
    .select("id, user_id, plan, status, payment_type, provider_payment_id, paid_at, amount_cents")
    .eq("status", "approved")
    .eq("payment_type", "subscription")
    .gte("paid_at", since);
  if (userId) approvedQuery = approvedQuery.eq("user_id", userId);
  const { data: rows, error } = await approvedQuery
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  let repaired = 0;
  let failed = 0;
  let review = 0;
  const seen = new Set<string>();
  for (const pay of rows ?? []) {
    if (seen.has(pay.user_id)) continue;
    seen.add(pay.user_id);
    const days: Record<string, number> = { monthly: 31, quarterly: 92, yearly: 365 };
    const duration = days[String(pay.plan)] ?? 0;
    if (!duration || !pay.provider_payment_id || !pay.paid_at) { review++; continue; }

    try {
      const { data: sub, error: subError } = await supabaseAdmin.from("subscriptions")
        .select("user_id, status, expires_at").eq("user_id", pay.user_id).maybeSingle();
      if (subError) throw subError;
      // Assinatura ativa com validade futura: o pagamento já pode ter sido aplicado.
      if (sub?.status === "active" && new Date(sub.expires_at).getTime() > Date.now()) continue;
      // Uma assinatura cancelada manualmente não pode ser reativada automaticamente.
      if (sub?.status === "cancelled") { review++; continue; }

      const mp = await fetchMpPayment(pay.provider_payment_id);
      const paidCents = Math.round(Number(mp.transaction_amount ?? 0) * 100);
      if (mp.status !== "approved" || String(mp.external_reference ?? "") !== pay.id ||
          paidCents !== pay.amount_cents) {
        review++;
        continue;
      }

      const activatedAt = new Date(pay.paid_at).toISOString();
      const purchasedExpiry = new Date(new Date(activatedAt).getTime() + duration * 86400000).toISOString();
      if (!sub) {
        const { error: insertError } = await supabaseAdmin.from("subscriptions").insert({
          user_id: pay.user_id, plan: pay.plan, status: "active",
          started_at: activatedAt, expires_at: purchasedExpiry, cancelled_at: null,
        } as any);
        // Uma concorrência pode inserir a assinatura entre a consulta e o INSERT.
        if (insertError?.code === "23505") continue;
        if (insertError) throw insertError;
        repaired++;
      } else {
        const currentExpiry = new Date(sub.expires_at).getTime();
        const finalExpiry = new Date(Math.max(currentExpiry || 0, new Date(purchasedExpiry).getTime())).toISOString();
        const { data: changed, error: updError } = await supabaseAdmin.from("subscriptions")
          .update({ status: "active", plan: pay.plan, expires_at: finalExpiry, cancelled_at: null } as any)
          .eq("user_id", pay.user_id)
          .eq("status", sub.status)
          .eq("expires_at", sub.expires_at)
          .select("user_id").maybeSingle();
        if (updError) throw updError;
        if (changed) repaired++;
      }
    } catch (err) {
      failed++;
      console.error("[mercadopago] approved payment activation recovery failed", pay.id, err);
    }
  }
  return { checked: rows?.length ?? 0, repaired, failed, review };
}
