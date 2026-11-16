import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {sanitizeAcquisitionInput} from "@/lib/ad-attribution";

/**
 * Immutable new-registration provenance, written by trusted signup endpoint.
 * Never rewrites legacy profiles or existing customer acquisition records.
 */
export async function recordRegistrationAttribution(input:{
  userId:string;profileCreatedAt:string;attribution:unknown;referralApplied:boolean;
}):Promise<boolean>{
  const x=sanitizeAcquisitionInput(input.attribution);
  const source=input.referralApplied?"referral":x?.source??"direct";
  const evidence=input.referralApplied?"validated_referral_code":x?.evidence??"no_ad_consent";
  const row={
    user_id:input.userId,source,evidence,platform:input.referralApplied?null:x?.platform??null,
    first_access_at:x?.first_access_at??input.profileCreatedAt,
    registered_at:input.profileCreatedAt,
    utm_source:x?.utm_source??null,utm_medium:x?.utm_medium??null,
    utm_campaign:x?.utm_campaign??null,utm_content:x?.utm_content??null,
    utm_term:x?.utm_term??null,
    campaign_id:x?.campaign_id??null,adset_id:x?.adset_id??null,ad_id:x?.ad_id??null,
    // Discard click identifiers for referral or insufficient campaign evidence.
    click_id:!input.referralApplied?x?.click_id??null:null,
    advertising_consent:!!x?.advertising_consent,
  };
  const {error}=await (supabaseAdmin as any).from("customer_acquisition")
    .upsert(row,{onConflict:"user_id",ignoreDuplicates:true});
  if(error)throw new Error("acquisition_write_failed");
  return true;
}
