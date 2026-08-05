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
            const text = `🎉 <b>Parabéns!</b>\nSeu indicado assinou um plano.\nVocê ganhou <b>\${reward}</b>!\n\nAnalisar e corrigir o Card "Comprar Créditos" do Painel do Revendedor\n\nO problema continua no card:\n\nTítulo: Comprar Créditos\n\nLocal:\nPainel do Revendedor → botão Comprar Créditos\n\nEsse card atualmente está usando uma lógica errada.\n\nNo print ele mostra:\n\n"Comprar Créditos"\n"Cada crédito permite que você crie 1 novo revendedor em sua rede."\nPacotes:\n10 Créditos — R$ 100,00\n30 Créditos — R$ 270,00\n40 Créditos — R$ 350,00\nMensagem:\n"Pagamento via PIX com ativação automática após a confirmação. O fluxo é o mesmo dos planos de assinatura."\nRegra correta desse card:\n\nEsse card é somente para o próprio revendedor comprar créditos para a conta dele.\n\nExemplo:\n\nAdmin\n↓\nRevendedor A\n\nRevendedor A entra no painel dele e clica:\n\nComprar Créditos\n\nAí sim:\n\n✅ Mostrar pacotes de créditos.\n✅ Pagamento vai para o Admin.\n✅ Após pagamento adicionar créditos.\n✅ Ativar uso do sistema.\n\nNão confundir com clientes da árvore:\n\nQuando:\n\nAdmin\n↓\nRevendedor A\n↓\nCliente B\n\nO Cliente B NÃO pode ver esse card.\n\nNão pode aparecer:\n\n❌ Comprar Créditos\n❌ Card de PIX\n❌ Pacotes 10/30/40 créditos\n\nCliente B deve ver:\n\n✅ Planos do Revendedor A.\n✅ Botão WhatsApp do Revendedor A.\n\nCorrigir a identificação:\n\nAntes de mostrar esse componente:\n\nVerificar:\n\nuser_type\n\nSe:\n\nuser_type = reseller\n\nMostrar:\n\nComprar Créditos\n\nSe:\n\nuser_type = client\n\nNão mostrar esse card.\n\nTambém revisar o caso:\n\nareaplay0106@gmail.com\n\nEsse usuário deve ser usado como teste.\n\nVerificar:\n\nTipo de conta atual.\nQuem é o revendedor pai.\nQual painel ele está carregando.\nQual componente está chamando o card "Comprar Créditos".\n\nO erro parece ser que o sistema está carregando o componente do revendedor para usuários que pertencem à árvore, sem validar corretamente o tipo de conta.`;
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
