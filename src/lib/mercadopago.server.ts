// Server-only helpers for Mercado Pago PIX integration.
// Do NOT import this file from client bundles.

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
      "X-Idempotency-Key": crypto.randomUUID(),
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
    case "authorized":
      return "approved";
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

export async function syncMpPayment(paymentId: string | number) {
  const mp = await fetchMpPayment(paymentId);
  const status = mapMpStatus(mp.status);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin.from("payments").select("*").limit(1);
  query = mp.external_reference
    ? query.eq("id", mp.external_reference)
    : query.eq("provider_payment_id", String(mp.id));

  const { data: rows, error: lookupError } = await query;
  if (lookupError) throw new Error(lookupError.message);
  const row = rows?.[0];
  if (!row) throw new Error("Cobrança não encontrada");

  if (row.status === "approved") {
    return { paymentId: row.id, status: "approved" as const, paidAt: row.paid_at, subscriptionExpiresAt: null };
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
    return {
      paymentId: row.id,
      status,
      paidAt,
      subscriptionExpiresAt: finalized?.[0]?.expires_at ?? null,
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

  return { paymentId: row.id, status, paidAt: row.paid_at, subscriptionExpiresAt: null };
}

/**
 * Safety net: re-checks recent pending PIX charges directly with Mercado Pago
 * and finalizes any that were already paid (e.g. when the webhook was missed).
 */
export async function reconcilePendingPayments(limit = 40) {
  if (!getMpToken()) return { checked: 0, approved: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("payments")
    .select("id, provider_payment_id")
    .eq("status", "pending")
    .not("provider_payment_id", "is", null)
    .gt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  let approved = 0;
  for (const row of rows ?? []) {
    try {
      const res = await syncMpPayment(row.provider_payment_id as string);
      if (res.status === "approved") approved++;
    } catch (e) {
      console.error("[mercadopago] reconcile failed for", row.id, e);
    }
  }
  return { checked: rows?.length ?? 0, approved };
}
