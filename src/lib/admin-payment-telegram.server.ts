import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {formatAdminPaymentReceipt} from "./admin-payment-telegram-format";

const MASTER_ADMIN_EMAIL="victorsampaio133@gmail.com";
// Only reconcile payments made after deploying this idempotent notification flow.
// Older successful payments may already have been notified by the legacy webhook.
// The one reported missed payment can be backfilled separately, once.
const RESCUE_START="2026-11-18T00:30:00.000Z";

function chatId(value:unknown):string|null{
  const candidate=String(value||"").trim();
  return /^-?\d{5,20}$/.test(candidate)?candidate:null;
}

/** One admin destination. Existing enabled master-admin channel takes priority,
 * with the legacy configured admin chat as fallback. Nothing is exposed to
 * the browser and Telegram failures do not affect payment activation.
 */
async function adminChat():Promise<string|null>{
  const db=supabaseAdmin as any;
  const {data:owner,error:ownerError}=await db.from("profiles")
    .select("id").eq("email",MASTER_ADMIN_EMAIL).maybeSingle();
  if(ownerError)throw new Error("admin_payment_master_lookup_failed");
  if(owner?.id){
    const {data:channels,error}=await db.from("alert_channels")
      .select("target").eq("owner_id",owner.id).eq("kind","telegram")
      .eq("enabled",true).limit(10);
    if(error)throw new Error("admin_payment_telegram_channel_lookup_failed");
    const targets=[...new Set((channels||[]).map((x:any)=>chatId(x.target)).filter(Boolean))] as string[];
    const configured=chatId(process.env.ADMIN_TELEGRAM_CHAT_ID);
    if(configured&&targets.includes(configured))return configured;
    if(targets.length)return targets[0];
  }
  return chatId(process.env.ADMIN_TELEGRAM_CHAT_ID);
}

export async function enqueueAdminTelegramPaymentApproved(paymentId:string):Promise<{queued:number;reason?:string}>{
  if(!/^[0-9a-f-]{36}$/i.test(paymentId))throw new Error("invalid_admin_payment_id");
  const db=supabaseAdmin as any;
  const {data:payment,error}=await db.from("payments")
    .select("id,user_id,plan,payment_type,amount_cents,paid_at,status")
    .eq("id",paymentId).maybeSingle();
  if(error)throw new Error("admin_payment_lookup_failed");
  if(!payment||payment.status!=="approved"||!payment.paid_at)return {queued:0,reason:"not_approved"};
  const target=await adminChat();
  if(!target)return {queued:0,reason:"admin_chat_not_configured"};
  const {data:profile,error:profileError}=await db.from("profiles")
    .select("full_name,email").eq("id",payment.user_id).maybeSingle();
  if(profileError)throw new Error("admin_payment_profile_lookup_failed");
  const {data:subscription,error:subError}=await db.from("subscriptions")
    .select("expires_at,status").eq("user_id",payment.user_id).maybeSingle();
  if(subError)throw new Error("admin_payment_subscription_lookup_failed");
  const text=formatAdminPaymentReceipt({
    name:profile?.full_name??null,email:profile?.email??null,
    plan:payment.plan??null,paymentType:payment.payment_type??null,
    amountCents:Number(payment.amount_cents||0),paymentId:payment.id,
    paidAt:payment.paid_at,expiresAt:subscription?.status==="active"?subscription.expires_at:null,
  });
  const idempotencyKey=`admin-paid:${payment.id}:${target}`;
  const {data:inserted,error:queueError}=await db.from("telegram_outbox").upsert({
    idempotency_key:idempotencyKey,target,text,source:"admin_payment",
    status:"pending",attempts:0,max_attempts:7,
    next_attempt_at:new Date().toISOString(),alert_event:"admin_payment_confirmed",
  },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id");
  if(queueError)throw new Error("admin_payment_telegram_enqueue_failed");
  return {queued:inserted?.length?1:0,reason:inserted?.length?"queued":"already_recorded"};
}

/** Recovery for queue writes that failed during the original payment sync.
 * Only approved payments from this rollout onward; no re-crediting or
 * subscription changes. Runs inside the existing monitored Telegram cycle.
 */
export async function reconcileAdminPaymentReceipts(limit=8){
  const {data:payments,error}=await (supabaseAdmin as any).from("payments")
    .select("id").eq("status","approved").gte("paid_at",RESCUE_START)
    .order("paid_at",{ascending:false}).limit(Math.min(20,Math.max(1,limit)));
  if(error)throw new Error("admin_payment_recovery_query_failed");
  let queued=0,skipped=0,failed=0;
  for(const item of payments||[]){
    try{
      const result=await enqueueAdminTelegramPaymentApproved(item.id);
      if(result.queued)queued++;else skipped++;
    }catch(e){failed++;console.error("[admin-payment-telegram] reconcile failed",
      e instanceof Error?e.name:"unknown");}
  }
  return {checked:(payments||[]).length,queued,skipped,failed};
}
