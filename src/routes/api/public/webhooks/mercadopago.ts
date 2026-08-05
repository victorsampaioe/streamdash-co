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
            const text = `🎉 <b>Parabéns!</b>\nSeu indicado assinou um plano.\nVocê ganhou <b>\${reward}</b>!\n\nCorrigir herança de configurações na árvore de revendedores\n\nO problema continua: quando um revendedor cria outro usuário/revenda, o sistema está mostrando meus dados de Admin (PIX, planos e configurações), em vez dos dados do revendedor responsável pela árvore.\n\nCorrigir a lógica de origem:\n\nCadastro vindo de um Revendedor\n\nSe o usuário entrar pela árvore de um revendedor:\n\nUsar somente as configurações desse revendedor:\n\n✅ PIX do revendedor.\n✅ Planos/preços configurados pelo revendedor.\n✅ WhatsApp/contato do revendedor.\n✅ Página pública do revendedor.\n✅ Informações comerciais do revendedor.\n\nNunca usar:\n\n❌ PIX do Admin.\n❌ Planos do Admin.\n❌ Contato do Admin.\n\nCadastro direto pelo sistema\n\nSomente quando o cliente vier diretamente pelo site ou for criado pelo Admin:\n\nUsar:\n\nPIX do Admin.\nPlanos do Admin.\nConfigurações do Admin.\n\nVerificar:\n\nID do revendedor pai (parent_reseller_id ou equivalente).\nOrigem do cadastro.\nBusca das configurações de pagamento.\nBusca dos planos exibidos.\nPágina de compra de créditos.\n\nCriar uma regra:\n\nSe possui revendedor pai → carregar configurações do revendedor pai.\n\nSe não possui revendedor pai → carregar configurações do Admin.\n\nFazer teste:\n\nAdmin → Revendedor A → Cliente B\n\nCliente B deve ver apenas dados do Revendedor A.`;
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
