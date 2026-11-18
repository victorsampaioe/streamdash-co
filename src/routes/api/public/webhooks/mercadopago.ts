import { createFileRoute } from "@tanstack/react-router";

// Mercado Pago webhook (IPN / Webhooks v2).
// URL: https://streammonitor.site/api/public/webhooks/mercadopago

async function processPayment(mpPaymentId: string) {
  const {syncMpPayment}=await import("@/lib/mercadopago.server");
  // The shared payment finalizer is responsible for the admin Telegram
  // receipt, regardless of whether webhook or customer polling wins.
  // Do not send a second, untracked admin message here.
  await syncMpPayment(mpPaymentId);
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const type = url.searchParams.get("type") || body?.type || body?.topic;
  // IPN pode trazer resource como URL; nunca confundir o ID da notificação com o do pagamento.
  const rawPaymentId = url.searchParams.get("data.id") || body?.data?.id ||
    body?.resource || url.searchParams.get("id");
  const rawValue = String(rawPaymentId ?? "").trim();
  const idParts = rawValue.split("?")[0].split("/").filter(Boolean);
  const idCandidate = idParts[idParts.length - 1] ?? "";
  const paymentId = idCandidate && [...idCandidate].every(ch => ch >= "0" && ch <= "9") ? idCandidate : null;

  if (type && String(type) !== "payment") {
    return new Response("ignored", { status: 200 });
  }
  if (!paymentId) {
    console.error("[mp-webhook] missing or invalid payment id", { type });
    return new Response("invalid payment id", { status: 400 });
  }

  try {
    await processPayment(String(paymentId));
    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("[mp-webhook] error:", e?.message ?? e);
    // Retornar 5xx permite que o Mercado Pago reenvie após erros temporários.
    return new Response("payment sync failed", { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
