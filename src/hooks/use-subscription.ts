import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Subscription = {
  id: string;
  user_id: string;
  plan: "trial" | "monthly" | "yearly" | "reseller" | "basic";
  status: "trial" | "active" | "expired" | "cancelled";
  started_at: string;
  expires_at: string;
  cancelled_at: string | null;
};

export type SubscriptionInfo = {
  subscription: Subscription | null;
  daysRemaining: number;
  isActive: boolean;
  isExpired: boolean;
  isTrial: boolean;
  isExpiringSoon: boolean; // <= 7 days
  parentId: string | null;
  ownerId: string | null;
  profile: {
    id: string;
    email: string | null;
    phone: string | null;
    full_name: string | null;
    is_reseller: boolean;
    credits: number;
    role: string | null;
    created_at: string;
    signup_bonus_days: number;
  } | null;
};

const PLAN_LABEL: Record<string, string> = {
  trial: "Teste Gratuito",
  monthly: "Mensal",
  yearly: "Anual",
  reseller: "Revendedor",
  basic: "Básico",
};

const STATUS_LABEL: Record<Subscription["status"], string> = {
  trial: "Teste Gratuito",
  active: "Ativa",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export function planLabel(p: string) { return PLAN_LABEL[p] || p; }
export function statusLabel(s: Subscription["status"]) { return STATUS_LABEL[s]; }

export function useSubscription() {
  return useQuery<SubscriptionInfo>({
    queryKey: ["subscription", "me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        return { 
          subscription: null, 
          daysRemaining: 0, 
          isActive: false, 
          isExpired: false, 
          isTrial: false, 
          isExpiringSoon: false, 
          parentId: null,
          ownerId: null,
          profile: null
        };
      }

      const [
        { data: subData, error: subError }, 
        { data: profile, error: profileError },
        { data: tree },
        { data: wallet },
        { data: roleRows, error: rolesError },
        { data: hasResellerRole },
        { data: hasSubResellerRole }
      ] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, email, phone, full_name, is_reseller, created_at, signup_bonus_days")
          .eq("id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("reseller_tree")
          .select("parent_reseller_id, owner_id")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("reseller_wallet")
          .select("credits")
          .eq("reseller_id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id),
        supabase.rpc("has_role", { _user_id: userData.user.id, _role: "reseller" }),
        supabase.rpc("has_role", { _user_id: userData.user.id, _role: "sub_reseller" })
      ]);

      if (subError) console.error("Sub error:", subError);
      if (profileError) console.error("Profile error:", profileError);
      if (rolesError) console.error("Roles error:", rolesError);
      const now = Date.now();

      const credits = wallet?.credits || 0;
      const roles = roleRows?.map((row) => String(row.role)) ?? [];
      const resellerRole = roles.find((role) => role === "reseller" || role === "sub_reseller");
      // Roles are authoritative. The RPC fallback avoids an RLS-filtered role query,
      // while the profile/wallet checks preserve compatibility with legacy accounts.
      const isReseller = !!resellerRole || !!hasResellerRole || !!hasSubResellerRole || !!profile?.is_reseller || !!wallet;

      const prof = profile ? {
        id: profile.id,
        email: profile.email,
        phone: profile.phone,
        full_name: profile.full_name,
        is_reseller: isReseller,
        credits: credits,
        role: resellerRole ?? (hasSubResellerRole ? "sub_reseller" : hasResellerRole ? "reseller" : roles[0] ?? null),
        created_at: profile.created_at,
        signup_bonus_days: profile.signup_bonus_days || 0,
      } : null;

      const parentId = tree?.parent_reseller_id || null;
      const ownerId = tree?.owner_id || null;

      if (!subData) {
        // Check for signup bonus period
        const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
        const bonusMs = (profile?.signup_bonus_days || 0) * 24 * 60 * 60 * 1000;
        const bonusExpired = createdAt + bonusMs <= now;
        const isBonusActive = !bonusExpired && bonusMs > 0;

        return { 
          subscription: null, 
          daysRemaining: isBonusActive ? Math.ceil((createdAt + bonusMs - now) / (24 * 60 * 60 * 1000)) : 0, 
          // Resellers are active based on being a reseller, or if they have an active bonus
          isActive: isReseller || isBonusActive,
          isExpired: !isReseller && !isBonusActive,
          isTrial: isBonusActive, 
          isExpiringSoon: isBonusActive && (createdAt + bonusMs - now) / (24 * 60 * 60 * 1000) <= 7, 
          parentId,
          ownerId,
          profile: prof
        };
      }

      const sub = subData as Subscription;
      const exp = new Date(sub.expires_at).getTime();
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((exp - now) / msPerDay));
      const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
      const bonusMs = (profile?.signup_bonus_days || 0) * 24 * 60 * 60 * 1000;
      const isBonusActive = createdAt + bonusMs > now && bonusMs > 0;
      const isExpired = exp <= now || sub.status === "expired" || sub.status === "cancelled";
      
      // Reseller can always access panel. Clients are active if subscription is valid OR bonus is active.
      const isActive = isReseller 
        ? true 
        : (isBonusActive || (!isExpired && (sub.status === "trial" || sub.status === "active")));
      
      return {
        subscription: sub,
        daysRemaining,
        isActive,
        isExpired,
        isTrial: (sub.status === "trial" || isBonusActive) && !isExpired,
        isExpiringSoon: isActive && daysRemaining <= 7,
        parentId,
        ownerId,
        profile: prof
      };
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}
