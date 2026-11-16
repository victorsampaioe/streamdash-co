import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

/**
 * Only authenticated, provider-approved, paid subscription charges.
 * Pending PIX, referrals, credit-only renewals, refunds and store sales
 * must NEVER become Meta Purchase events.
 */
export const getRecentConfirmedPurchases=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const since=new Date(Date.now()-24*60*60*1000).toISOString();
  const {data,error}=await supabaseAdmin.from("payments")
    .select("id,amount_cents,currency,paid_at,plan")
    .eq("user_id",context.userId)
    .eq("status","approved")
    .eq("payment_type","subscription")
    .in("plan",["monthly","quarterly","yearly"])
    .gte("paid_at",since)
    .order("paid_at",{ascending:false})
    .limit(10);
  if(error)throw new Error("purchase_verification_unavailable");
  return (data??[])
    .filter(x=>Number.isSafeInteger(x.amount_cents)&&x.amount_cents>0
      &&x.currency==="BRL"&&!!x.paid_at)
    .map(x=>({id:x.id,amountCents:x.amount_cents,currency:"BRL" as const}));
});
