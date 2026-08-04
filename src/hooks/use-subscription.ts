import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Subscription = {
  id: string;
  user_id: string;
  plan: "trial" | "monthly" | "yearly";
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
  profile: {
    phone: string | null;
    full_name: string | null;
    is_reseller: boolean;
    credits: number;
  } | null;
};

const PLAN_LABEL: Record<Subscription["plan"], string> = {
  trial: "Teste Gratuito",
  monthly: "Mensal",
  yearly: "Anual",
};

const STATUS_LABEL: Record<Subscription["status"], string> = {
  trial: "Teste Gratuito",
  active: "Ativa",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export function planLabel(p: Subscription["plan"]) { return PLAN_LABEL[p]; }
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
          profile: null
        };
      }

      const [{ data: subData }, { data: profile }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("parent_id, phone, full_name, is_reseller, credits")
          .eq("id", userData.user.id)
          .maybeSingle()
      ]);

      const prof = profile ? {
        phone: profile.phone,
        full_name: profile.full_name,
        is_reseller: !!profile.is_reseller,
        credits: profile.credits || 0
      } : null;

      if (!subData) {
        return { 
          subscription: null, 
          daysRemaining: 0, 
          isActive: false, 
          isExpired: true, 
          isTrial: false, 
          isExpiringSoon: false, 
          parentId: profile?.parent_id || null,
          profile: prof
        };
      }

      const sub = subData as Subscription;
      const now = Date.now();
      const exp = new Date(sub.expires_at).getTime();
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((exp - now) / msPerDay));
      const isExpired = exp <= now || sub.status === "expired" || sub.status === "cancelled";
      const isActive = !isExpired && (sub.status === "trial" || sub.status === "active");
      
      return {
        subscription: sub,
        daysRemaining,
        isActive,
        isExpired,
        isTrial: sub.status === "trial" && !isExpired,
        isExpiringSoon: isActive && daysRemaining <= 7,
        parentId: profile?.parent_id || null,
        profile: prof
      };
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}
