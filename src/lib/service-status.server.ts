import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Enhanced subscription check that accounts for reseller credits.
 * Returns true if the user has an active subscription AND (if reseller) has credits > 0.
 * Admins always pass.
 */
export async function isServiceActive(userId: string): Promise<boolean> {
  const [{ data: isAdmin }, { data: profile }, { data: sub }] = await Promise.all([
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabaseAdmin.from("profiles").select("is_reseller, credits").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("subscriptions").select("status, expires_at").eq("user_id", userId).maybeSingle()
  ]);

  if (isAdmin) return true;

  const isReseller = !!profile?.is_reseller;
  const credits = profile?.credits || 0;

  // RULE: Reseller ONLY depends on credits > 0 for operational services.
  // They can always access the panel.
  if (isReseller) {
    return credits > 0;
  }

  // RULE: Client ONLY depends on active subscription.
  const isSubActive = !!sub && 
    (sub.status === "active" || sub.status === "trial") && 
    new Date(sub.expires_at).getTime() > Date.now();

  return isSubActive;
}
