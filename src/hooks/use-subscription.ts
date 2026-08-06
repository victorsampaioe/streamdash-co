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
    phone: string | null;
    full_name: string | null;
    is_reseller: boolean;
    credits: number;
    role: string | null;
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
        { data: roleRows, error: rolesError }
      ] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("phone, full_name, is_reseller")
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
          .eq("user_id", userData.user.id)
      ]);

      if (subError) console.error("Sub error:", subError);
      if (profileError) console.error("Profile error:", profileError);
      if (rolesError) console.error("Roles error:", rolesError);

      const credits = wallet?.credits || 0;
      const roles = roleRows?.map((row) => String(row.role)) ?? [];
      const resellerRole = roles.find((role) => role === "reseller" || role === "sub_reseller");
      // Roles are authoritative. Keep the profile flag only as backwards-compatible
      // support for legacy reseller accounts that have not been migrated yet.
      const isReseller = !!resellerRole || !!profile?.is_reseller;

      const prof = profile ? {
        phone: profile.phone,
        full_name: profile.full_name,
        is_reseller: isReseller,
        credits: credits,
        role: resellerRole ?? roles[0] ?? null
      } : null;

      const parentId = tree?.parent_reseller_id || null;
      const ownerId = tree?.owner_id || null;

      if (!subData) {
        return { 
          subscription: null, 
          daysRemaining: 0, 
          // Resellers are active based on being a reseller
          isActive: isReseller,
          isExpired: !isReseller,
          isTrial: false, 
          isExpiringSoon: false, 
          parentId,
          ownerId,
          profile: prof
        };
      }

      const sub = subData as Subscription;
      const now = Date.now();
      const exp = new Date(sub.expires_at).getTime();
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((exp - now) / msPerDay));
      const isExpired = exp <= now || sub.status === "expired" || sub.status === "cancelled";
      
      // Reseller can always access panel
      const isActive = isReseller 
        ? true 
        : (!isExpired && (sub.status === "trial" || sub.status === "active"));
      
      return {
        subscription: sub,
        daysRemaining,
        isActive,
        isExpired,
        isTrial: sub.status === "trial" && !isExpired,
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
