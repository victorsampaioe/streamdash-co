import { createFileRoute } from "@tanstack/react-router";

// Mercado Pago webhook (IPN / Webhooks v2).
// URL: https://streammonitor.site/api/public/webhooks/mercadopago
// MP posts JSON like: { action: "payment.updated", data: { id: "123" }, type: "payment", ... }
// We refetch the payment from MP to avoid trusting the payload, then update DB.

async function processPayment(mpPaymentId: string) {
  const { syncMpPayment } = await import("@/lib/mercadopago.server");
  const res = await syncMpPayment(mpPaymentId);
  if (res.status === "approved") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyAdmin } = await import("@/lib/admin-telegram.server");
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("user_id, plan, amount_cents")
        .eq("id", res.paymentId)
        .maybeSingle();
      const { data: prof } = pay
        ? await supabaseAdmin.from("profiles").select("email, full_name").eq("id", pay.user_id).maybeSingle()
        : { data: null as any };
      const brl = pay ? (pay.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-";
      await notifyAdmin(
        `💰 <b>Assinatura confirmada</b>\nPlano: ${pay?.plan ?? "-"}\nValor: ${brl}\nUsuário: ${prof?.full_name ?? "-"} — ${prof?.email ?? "-"}\nValidade: ${res.subscriptionExpiresAt ? new Date(res.subscriptionExpiresAt).toLocaleString("pt-BR") : "-"}`
      );

      // Notify indicator (referrer) via their Telegram channel if a referral just converted
      if (pay?.user_id) {
        const { data: ref } = await supabaseAdmin
          .from("referrals")
          .select("referrer_id, reward_cents")
          .eq("referred_id", pay.user_id)
          .eq("status", "subscribed")
          .maybeSingle();
        if (ref?.referrer_id) {
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            const { data: channels } = await supabaseAdmin
              .from("alert_channels")
              .select("target")
              .eq("owner_id", ref.referrer_id)
              .eq("kind", "telegram")
              .eq("enabled", true);
            const reward = ((ref.reward_cents ?? 1000) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const text = `🎉 <b>Parabéns!</b>\nSeu indicado assinou um plano.\nVocê ganhou <b>\${reward}</b>!\n\nCorrigir botão de contratação dos revendedores na árvore\n\nFoi identificado um erro no fluxo dos revendedores.\n\nQuando um cliente da árvore de um revendedor clica no botão para contratar/entrar em contato, o sistema está abrindo o meu PIX do Admin.\n\nIsso está errado.\n\nA regra correta:\n\nQuando o cliente pertence à árvore de um revendedor:\n\nO botão deve usar as informações daquele revendedor responsável.\nNão pode puxar os dados do Admin.\nNão pode abrir meu card de PIX.\n\nComo revendedores não possuem PIX no sistema:\n\nAo clicar no botão:\n\n✅ Abrir WhatsApp do revendedor responsável.\n✅ Usar o número cadastrado daquele revendedor.\n✅ Enviar mensagem de contato referente aos planos dele.\n\nExemplo:\n\nAdmin\n↓\nRevendedor A\n↓\nCliente da árvore A\n\nO cliente deve falar com o WhatsApp do Revendedor A.\n\nNunca deve aparecer:\n\n❌ Card PIX do Admin.\n❌ Pagamento do Admin.\n❌ Configuração de outro revendedor.\n\nVerificar a origem do usuário e usar sempre o reseller_id / revendedor pai correto para carregar o contato.`;
            for (const ch of channels ?? []) {
              const raw = String(ch.target ?? "").trim();
              const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
              if (!chatId) continue;
              try {
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
                });
              } catch { /* ignore */ }
            }
          }
        }
      }
    } catch (e) { console.error("[mp-webhook] notify:", e); }
  }
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }

  // Extract payment id from either query (?data.id=...&type=payment) or body
  const type = url.searchParams.get("type") || body?.type || body?.topic;
  const paymentId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    body?.data?.id ||
    body?.resource;

  if (type && String(type) !== "payment") {
    return new Response("ignored", { status: 200 });
  }
  if (!paymentId) return new Response("missing payment id", { status: 200 });

  try {
    await processPayment(String(paymentId));
    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("[mp-webhook] error:", e?.message ?? e);
    // Return 200 to prevent retry loops on unrecoverable errors; log for debugging.
    return new Response(`error: ${e?.message ?? "unknown"}`, { status: 200 });
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
