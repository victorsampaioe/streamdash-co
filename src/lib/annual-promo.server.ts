/**
 * Flash promotion for the Stream Monitor annual subscription.
 * Campaign status and date are checked on every request in the database.
 * This promotion is global, for active and expired accounts, resellers and clients.
 * Other resellers' saved prices remain untouched.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_OWNER_ID = "ce0adb32-7f35-42cb-9605-539d0ef2e2dd";
const CAMPAIGN_KEY = "promo_annual_admin_20261119";

export type AnnualPromotion = {
  campaignKey: string;
  priceCents: number;
  endsAt: string;
};

export async function getActiveAnnualPromo(): Promise<AnnualPromotion | null> {
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
    campaignKey: String(campaign.campaign_key),
    priceCents: Number(campaign.promo_price_cents),
    endsAt: String(campaign.ends_at),
  };
}
