import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isServiceActive } from "./service-status.server";

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Acesso pausado. Verifique a validade da sua assinatura (Cliente) ou seu saldo de créditos (Revendedor) para continuar";

/**
 * Server-side gate: the caller must be authenticated AND have an active
 * subscription (trial or paid, not expired). Admins always pass.
 * Use on every server function that performs real work (checks, syncs,
 * analysis, exports), so blocking is enforced on the API, not only in the UI.
 */
export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const active = await isServiceActive(context.userId);
    if (!active) throw new Error(SUBSCRIPTION_REQUIRED_MESSAGE);
    return next();
  });
