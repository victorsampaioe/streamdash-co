/** One-day, owner-scoped annual offer. Server-side enforcement only. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_OWNER_ID = "ce0adb32-7f35-42cb-9605-539d0ef2e2dd";
const CAMPAIGN_KEY = "promo_annual_admin_20261119";

export type AnnualPromotion = {
  campaignKey: string;
  priceCents: number;
  endsAt: string;
};

export async function getAdminAnnualPromo(userId: string): Promise<AnnualPromotion | null> {
  if (!userId) return null;
  // Only the administrator's actual tree; never trust a client-supplied owner.
  const { data: tree, error: treeError } = await supabaseAdmin
    .from("reseller_tree")
    .select("owner_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (treeError) throw new Error("Não foi possível verificar a elegibilidade da promoção.");
  if (tree?.owner_id !== ADMIN_OWNER_ID) return null;

  const now = new Date().toISOString();
  const { data: campaign, error } = await (supabaseAdmin as any)
    .from("promo_campaigns")
    .select("campaign_key,promo_price_cents,ends_at")
    .eq("campaign_key", CAMPAIGN_KEY)
    .eq("owner_id", ADMIN_OWNER_ID)
    .eq("plan_code", "yearly")
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar a promoção anual.");
  if (!campaign) return null;
  return {
    campaignKey: campaign.campaign_key,
    priceCents: Number(campaign.promo_price_cents),
    endsAt: String(campaign.ends_at),
  };
}
