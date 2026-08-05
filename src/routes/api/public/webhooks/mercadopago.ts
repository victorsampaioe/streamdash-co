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
            const text = `🎉 <b>Parabéns!</b>\nSeu indicado assinou um plano.\nVocê ganhou <b>\${reward}</b>!\n\nCorreção da hierarquia da árvore de revendedores\n\nInformação importante para teste:\n\n📧 areaplay0106@gmail.com\n\nEsse usuário não é um revendedor independente.\n\nEle faz parte da árvore do revendedor:\n\n📧 interconect2023@gmail.com\n\nFoi o interconect2023@gmail.com que criou essa conta.\n\nEntão toda configuração comercial dessa conta deve vir do revendedor pai:\n\ninterconect2023@gmail.com\n\nCorrigir a busca de configurações:\n\nQuando um usuário pertence a uma árvore de revendedor:\n\nExemplo:\n\nAdmin\n↓\ninterconect2023@gmail.com (Revendedor pai)\n↓\nareaplay0106@gmail.com (Sub-revendedor/cliente da árvore)\n\nO sistema deve carregar:\n\n✅ Configurações do interconect2023@gmail.com\n✅ Planos configurados por ele\n✅ WhatsApp dele\n✅ Regras da rede dele\n\nNunca carregar:\n\n❌ Configurações do Admin\n❌ Meu PIX\n❌ Meus planos\n❌ Minha página comercial\n\nVerificar no banco:\n\nQuem criou o usuário (created_by).\nID do revendedor pai (parent_reseller_id).\nÁrvore de indicação/rede.\nHerança de configurações.\n\nA regra deve ser:\n\nSe possui revendedor pai:\n    usar configurações do revendedor pai\n\nSe não possui revendedor pai:\n    usar configurações do Admin\n\nTestar especificamente:\n\nUsuário:\nareaplay0106@gmail.com\n\nCriado por:\ninterconect2023@gmail.com\n\nEle deve usar a configuração do interconect2023@gmail.com.`;
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
