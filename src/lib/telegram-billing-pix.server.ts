/**
 * User-initiated Telegram PIX checkout for an authenticated-by-link private chat.
 * Never rely on Telegram usernames and never activate service without the
 * Mercado Pago provider webhook/verification.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLANS, effectivePriceCents, formatBRL } from "./payments";
import { getBillingState } from "./telegram-billing.server";
import { createMpPixCharge, getMpToken } from "./mercadopago.server";
import { withCycleLock } from "./job-lock.server";

type PixOutcome =
  | { type:"pix";code:string;expiresAt:string;amountCents:number;discountCents:number;planName:string }
  | { type:"credited" }
  | { type:"wallet" }
  | { type:"retry" };

async function buildPix(userId:string):Promise<PixOutcome> {
  const { wallet,subscription } = await getBillingState(userId);
  if(wallet!==null && (!subscription || !["monthly","quarterly","yearly"].includes(subscription.plan))){
    // Credit-reseller prices can be customized by the parent.
    // Never charge a fixed plan amount to credit-wallet resellers.
    return {type:"wallet"};
  }
  const {data:admin,error:adminError}=await supabaseAdmin.rpc("has_role",{_user_id:userId,_role:"admin"});
  if(adminError)throw new Error("Não foi possível verificar a permissão da conta.");
  if(admin)return {type:"wallet"};

  const selectedPlan=subscription && ["monthly","quarterly","yearly"].includes(subscription.plan)
    ? subscription.plan : "monthly";
  const plan=PLANS.find(p=>p.id===selectedPlan);
  if(!plan)throw new Error("Plano de assinatura não configurado.");
  const amountCents=effectivePriceCents(plan);
  const expiresAt=new Date(Date.now()+30*60*1000).toISOString();

  let {data:pending,error:findError}=await supabaseAdmin.from("payments")
    .select("id,amount_cents,gross_amount_cents,referral_discount_cents,expires_at,pix_copy_paste,pix_qr_code,status")
    .eq("user_id",userId).eq("status","pending").eq("payment_type","subscription").eq("plan",selectedPlan)
    .gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(findError)throw new Error("Não foi possível consultar cobranças pendentes.");
  if(pending?.pix_copy_paste||pending?.pix_qr_code){
    return {type:"pix",code:String(pending.pix_copy_paste||pending.pix_qr_code),expiresAt:String(pending.expires_at),amountCents:pending.amount_cents,discountCents:pending.referral_discount_cents??0,planName:plan.name};
  }
  if(!pending) {
    // The same table / webhook used by the website processes this payment.
    const {data:created,error:createError}=await supabaseAdmin.from("payments").insert({
      user_id:userId,provider:"mercadopago",method:"pix",status:"pending",
      amount_cents:amountCents,gross_amount_cents:amountCents,referral_discount_cents:0,
      currency:"BRL",plan:selectedPlan,payment_type:"subscription",expires_at:expiresAt
    } as never).select("id,amount_cents,referral_discount_cents,expires_at").single();
    if(createError||!created)throw new Error("Não foi possível abrir a cobrança Pix.");
    const {data:reserved,error:discountError}=await (supabaseAdmin as any).rpc("reserve_referral_discount",{_payment_id:created.id});
    if(discountError)throw new Error("Não foi possível calcular o desconto de indicação.");
    const amount=Number(reserved?.[0]?.amount_to_pay_cents??amountCents);
    if(amount===0){
      const {data:finalized,error:finalizeError}=await (supabaseAdmin as any).rpc("finalize_referral_credit_payment",{_payment_id:created.id});
      if(finalizeError||!finalized?.[0]?.applied)throw new Error("Falha na renovação com crédito.");
      return {type:"credited"};
    }
    pending={
      ...created,
      amount_cents:amount,
      referral_discount_cents:reserved?.[0]?.discount_cents??0,
      pix_copy_paste:null,pix_qr_code:null,
    } as typeof pending;
  }
  // Explicit MP token check before any provider charge. The pending record
  // remains safe to retry with the SAME external reference/idempotency key.
  if(!getMpToken())throw new Error("Mercado Pago indisponível. Gere seu Pix pelo painel.");
  const {data:profile}=await supabaseAdmin.from("profiles")
    .select("email").eq("id",userId).maybeSingle();
  const email=profile?.email?.trim()||`conta-${userId}@streammonitor.site`;
  const payment=await createMpPixCharge({
    amountCents:pending.amount_cents,
    description:`Stream Monitor — Plano ${plan.name}` +
      (pending.referral_discount_cents?" (crédito de indicação aplicado)":""),
    payerEmail:email,
    externalReference:pending.id,
    expiresAt:String(pending.expires_at),
    notificationUrl:`${process.env.SITE_URL||"https://streammonitor.site"}/api/public/webhooks/mercadopago`,
  });
  const code=payment.point_of_interaction?.transaction_data?.qr_code?.trim();
  if(!code)throw new Error("Mercado Pago não retornou Pix válido; não efetue pagamento fora da plataforma.");
  const {error:saveError}=await supabaseAdmin.from("payments").update({
    provider_payment_id:String(payment.id),pix_copy_paste:code,pix_qr_code:code,
    raw_payload:payment as any,
  }).eq("id",pending.id).eq("user_id",userId).eq("status","pending");
  if(saveError)throw new Error("Pix emitido, mas falhou ao vincular. Não pague até confirmar no painel.");
  return {type:"pix",code,amountCents:pending.amount_cents,planName:plan.name,
    discountCents:pending.referral_discount_cents??0,expiresAt:String(pending.expires_at)};
}

export async function generateTelegramPix(userId:string):Promise<string> {
  if(!/^[0-9a-f-]{36}$/i.test(userId))throw new Error("Usuário inválido.");
  const result=await withCycleLock(`tg-pix-${userId}`,60,()=>buildPix(userId));
  if("skipped" in result)return "⏳ Já estamos gerando seu Pix. Tente /pix novamente em alguns segundos.";
  if(result.type==="wallet")return "🪙 <b>Conta de revenda por créditos</b>\n\nSeus créditos não têm vencimento mensal. Para recarregar com o preço correto da sua revenda, acesse: https://streammonitor.site/app/subscription\n\nNão gere Pix fora do painel.";
  if(result.type==="credited")return "✅ <b>Renovação confirmada!</b>\n\nSeu saldo de indicações cobriu integralmente a assinatura. Consulte /fatura.";
  const esc=(s:string)=>s.replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]!));
  const expires=new Date(result.expiresAt).toLocaleTimeString("pt-BR",{timeZone:"America/Fortaleza",hour:"2-digit",minute:"2-digit"});
  return `💠 <b>Pix Stream Monitor — ${esc(result.planName)}</b>\n\n`+
    `💰 Valor: <b>${formatBRL(result.amountCents)}</b>\n`+
    (result.discountCents?`🎁 Indicações: -${formatBRL(result.discountCents)}\n`:"")+
    `⏱️ Código válido até: ${expires} (Fortaleza).\n\n`+
    `<b>Pix copia e cola:</b>\n<code>${esc(result.code)}</code>\n\n`+
    `✅ O sistema confirma o pagamento pelo Mercado Pago e renova automaticamente. Não envie comprovante.\n`+
    `🔒 Consulte sua cobrança em https://streammonitor.site/app/subscription`;
}
