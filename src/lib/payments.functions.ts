
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reconcilePendingPayments } from "./mercadopago.server";

export const reconcileAllPayments = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Usa a rotina existente que verifica no Mercado Pago pagamentos pendentes
    const res = await reconcilePendingPayments(50);

    // 2. Busca pagamentos aprovados que por algum motivo não ativaram assinatura
    const { data: approvedWithoutSub } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, plan, provider_payment_id, raw_payload, status, payment_type")
      .eq("status", "approved")
      .eq("payment_type", "subscription");

    let autoFixed = 0;
    for (const pay of approvedWithoutSub ?? []) {
      // Tenta finalizar para garantir que a assinatura existe e está correta
      const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc("finalize_approved_payment", {
        _payment_id: pay.id,
        _provider_payment_id: pay.provider_payment_id,
        _raw_payload: pay.raw_payload,
        _paid_at: new Date().toISOString()
      });

      if (!finalizeError) {
        autoFixed++;
        
        // Log de ativação
        await supabaseAdmin.from("activation_logs").insert({
          user_id: pay.user_id,
          payment_id: pay.id,
          plan: pay.plan,
          status_payment: pay.status,
          telegram_sent: false, // Será tentado abaixo
        });

        // Tentar enviar telegram se houver canal
        const { data: channels } = await supabaseAdmin
          .from("alert_channels")
          .select("target, kind")
          .eq("owner_id", pay.user_id)
          .eq("kind", "telegram")
          .eq("enabled", true);

        if (channels && channels.length > 0) {
          const { notifyUserActivation } = await import("./notifications.server");
          try {
            await notifyUserActivation(pay.user_id, pay.plan || "Mensal");
            await supabaseAdmin.from("activation_logs")
              .update({ telegram_sent: true } as never)
              .eq("payment_id", pay.id);
          } catch (e: any) {
            await supabaseAdmin.from("activation_logs")
              .update({ telegram_error: e.message } as never)
              .eq("payment_id", pay.id);
          }
        }
      }
    }

    return { 
      mp_checked: res.checked, 
      mp_approved: res.approved,
      db_fixed: autoFixed 
    };
  });
