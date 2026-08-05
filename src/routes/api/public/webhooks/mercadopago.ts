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
            const text = `🎉 <b>Parabéns!</b>\nSeu indicado assinou um plano.\nVocê ganhou <b>\${reward}</b>!\n\nCriar novo fluxo de assinatura e compra de créditos pelo site\n\nPreciso organizar o fluxo de pagamentos para diferenciar:\n\nClientes da minha árvore/rede.\nUsuários que chegam pelo site e querem assinar ou virar revendedores.\n\nTudo deve funcionar via PIX.\n\n1. Usuário cadastrado pela minha árvore\n\nQuando alguém entrar pelo cadastro de um revendedor da minha rede:\n\nIdentificar automaticamente a origem:\n\nQual revendedor indicou/criou.\nQual árvore pertence.\n\nNa área de assinatura mostrar duas opções:\n\nPlano Cliente\n\nPara quem quer usar como cliente final.\n\nTornar-se Revendedor\n\nPara quem quer comprar créditos e trabalhar como revendedor.\n\n2. Usuário que chega pelo site\n\nQuando alguém se cadastrar diretamente pelo site:\n\nNa tela de assinatura mostrar:\n\nOpção 1 — Cliente\n\nComprar plano normalmente.\n\nOpção 2 — Revendedor Stream Monitor\n\nComprar créditos e ativar conta de revendedor.\n\n3. Compra de créditos para novos revendedores\n\nCriar pacotes via PIX:\n\n💳 10 créditos → R$ 100\n💳 30 créditos → R$ 270\n💳 40 créditos → R$ 350\n\nAo pagar:\n\nConfirmar pagamento PIX.\nAdicionar créditos automaticamente.\nAlterar tipo de conta para Revendedor.\nAtivar painel de revendedor.\nRemover fluxo de cliente/plano.\n\nA conta não pode ficar como Cliente + Revendedor.\n\n4. Regra final de tipos de conta\n\nCliente:\n\nUsa plano.\nNão possui painel de revendedor.\n\nRevendedor:\n\nNão paga mensalidade.\nUsa créditos.\nCom 1 crédito ou mais o sistema funciona.\n\nConversão:\n\nCliente → Revendedor somente quando comprar créditos ou for migrado pelo admin.\n\n5. Admin\n\nNo painel Admin mostrar:\n\nQuem entrou pelo site.\nQuem veio pela árvore de qual revendedor.\nQuem comprou plano.\nQuem comprou créditos.\nHistórico de pagamentos PIX.\n\nObjetivo:\nTer um único sistema de pagamento PIX onde o usuário escolhe:\n\n🎬 Quero ser cliente\nou\n🚀 Quero ser revendedor\n\nE o sistema ativa automaticamente o tipo correto de conta.`;
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
