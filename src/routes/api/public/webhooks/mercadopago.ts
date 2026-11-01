import { createFileRoute } from "@tanstack/react-router";

// Mercado Pago webhook (IPN / Webhooks v2).
// URL: https://streammonitor.site/api/public/webhooks/mercadopago

async function processPayment(mpPaymentId: string) {
  const { syncMpPayment } = await import("@/lib/mercadopago.server");
  const res = await syncMpPayment(mpPaymentId);
  if (res.status === "approved") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyAdmin } = await import("@/lib/admin-telegram.server");
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("user_id, plan, store_product_id, api_plan_id, payment_type, amount_cents")
        .eq("id", res.paymentId)
        .maybeSingle();

      const { data: prof } = pay
        ? await supabaseAdmin.from("profiles").select("email, full_name").eq("id", pay.user_id).maybeSingle()
        : { data: null as any };

      const brl = pay ? (pay.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-";

      if (pay?.payment_type === "api_subscription" && pay.api_plan_id) {
        const { data: apiPlan } = await supabaseAdmin
          .from("api_plans")
          .select("name")
          .eq("id", pay.api_plan_id)
          .maybeSingle();
        await notifyAdmin(
          `🔌 <b>Assinatura API confirmada</b>\nPlano: ${apiPlan?.name ?? "API"}\nValor: ${brl}\nUsuário: ${prof?.full_name ?? "-"} — ${prof?.email ?? "-"}\nValidade: ${res.subscriptionExpiresAt ? new Date(res.subscriptionExpiresAt).toLocaleString("pt-BR") : "-"}`
        );
      } else if (pay?.store_product_id) {
        const { data: product } = await supabaseAdmin
          .from("store_products")
          .select("name")
          .eq("id", pay.store_product_id)
          .maybeSingle();

        await notifyAdmin(
          `🛍️ <b>Venda na Loja confirmada</b>\nProduto: ${product?.name ?? "Desconhecido"}\nValor: ${brl}\nUsuário: ${prof?.full_name ?? "-"} — ${prof?.email ?? "-"}\nID Transação: ${res.paymentId}`
        );
      } else {
        await notifyAdmin(
          `💰 <b>Assinatura confirmada</b>\nPlano: ${pay?.plan ?? "-"}\nValor: ${brl}\nUsuário: ${prof?.full_name ?? "-"} — ${prof?.email ?? "-"}\nValidade: ${res.subscriptionExpiresAt ? new Date(res.subscriptionExpiresAt).toLocaleString("pt-BR") : "-"}`
        );
      }


      console.log(`Payment processed for ${pay?.user_id || "unknown"}`);
    } catch (e) {
      console.error("Error in processPayment notify:", e);
    }
  }
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
  const idCandidate = rawValue.split("?")[0].split("/").filter(Boolean).at(-1) ?? "";
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
