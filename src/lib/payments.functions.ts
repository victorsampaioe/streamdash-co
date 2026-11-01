import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMpToken, reconcilePendingPayments, repairApprovedSubscriptionMismatches } from "./mercadopago.server";

/**
 * Ferramenta administrativa de recuperação financeira.
 * Consulta o status no Mercado Pago antes de alterar pagamentos/assinaturas.
 * A reparação de assinaturas aprovadas é segura contra chamadas repetidas.
 */
export const reconcileAllPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Forbidden");
    if (!getMpToken()) throw new Error("Mercado Pago não configurado nesta instância. Verifique MERCADOPAGO_ACCESS_TOKEN.");

    // 1. Recupera webhooks perdidos (inclui as cobranças Pix de hoje).
    const mp = await reconcilePendingPayments(100);

    // 2. Corrige apenas assinaturas aprovadas que continuam sem acesso.
    // Não reenfileira todas as aprovações, evitando logs e ativações duplicados.
    const repairs = await repairApprovedSubscriptionMismatches(100);

    return {
      mp_checked: mp.checked,
      mp_approved: mp.approved,
      mp_failed: mp.failed,
      db_checked: repairs.checked,
      db_fixed: repairs.repaired,
      db_failed: repairs.failed,
      needs_review: repairs.review,
    };
  });
