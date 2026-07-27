// Server-only helpers for Mercado Pago PIX integration.
// Do NOT import this file from client bundles.

const MP_BASE = "https://api.mercadopago.com";

export type MpPixPayment = {
  id: number;
  status: string;
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
    transaction_amount: Number((params.amountCents / 100).toFixed(2)),
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
