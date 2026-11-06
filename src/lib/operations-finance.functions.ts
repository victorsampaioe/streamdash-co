import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Diagnóstico financeiro somente para administradores: não altera assinaturas. */
export const getFinancialPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || !admin) throw new Error("Acesso restrito ao administrador");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 86400000).toISOString();
    const { data: payments, error: pe } = await supabaseAdmin.from("payments")
      .select("id, user_id, payment_type, plan, status, paid_at, created_at, amount_cents")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    if (pe) throw new Error(pe.message);
    const paid = (payments ?? []).filter(p => p.status === "approved");
    const ids = Array.from(new Set(paid.filter(p => p.payment_type === "subscription").map(p => p.user_id)));
    let subscriptions: Array<{ user_id: string; status: string; expires_at: string | null }> = [];
    if (ids.length) {
      const { data, error } = await supabaseAdmin.from("subscriptions")
        .select("user_id, status, expires_at")
        .in("user_id", ids.slice(0, 400))
        .order("expires_at", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      subscriptions = data ?? [];
    }
    // Uma conta pode ter várias assinaturas históricas. Usar a mais
    // recente/válida, não uma linha antiga retornada em ordem indefinida.
    const byUser = new Map<string, (typeof subscriptions)[number]>();
    for (const s of subscriptions) {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, s);
    }
    const needsReview = paid.filter(p => p.payment_type === "subscription" && (
      !byUser.has(p.user_id) ||
      byUser.get(p.user_id)?.status !== "active" ||
      new Date(byUser.get(p.user_id)?.expires_at ?? 0).getTime() <= now.getTime()
    ));
    return {
      paidLast30d: paid.length,
      revenueCentsLast30d: paid.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0),
      pendingLast30d: (payments ?? []).filter(p => p.status === "pending").length,
      needsReview: needsReview.slice(0, 20).map(p => ({
        id: p.id, userId: p.user_id, paidAt: p.paid_at, plan: p.plan,
      })),
      limited: (payments ?? []).length === 500 || ids.length > 400,
    };
  });
