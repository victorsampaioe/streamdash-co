import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Assinatura inativa. Renove seu plano via PIX para liberar este recurso.";

/**
 * Server-side gate: the caller must be authenticated AND have an active
 * subscription (trial or paid, not expired). Admins always pass.
 * Use on every server function that performs real work (checks, syncs,
 * analysis, exports), so blocking is enforced on the API, not only in the UI.
 */
export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin) return next();

    const { data: sub, error } = await context.supabase
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const active =
      !!sub &&
      (sub.status === "active" || sub.status === "trial") &&
      new Date(sub.expires_at).getTime() > Date.now();
    if (!active) throw new Error(SUBSCRIPTION_REQUIRED_MESSAGE);

    return next();
  });
