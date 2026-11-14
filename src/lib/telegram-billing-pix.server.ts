/**
 * User-initiated Telegram PIX checkout for an authenticated-by-link private chat.
 * Never rely on Telegram usernames and never activate service without the
 * Mercado Pago provider webhook/verification.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PLANS, CREDIT_PACKS, effectivePriceCents, formatBRL } from "./payments";
import { getBillingState } from "./telegram-billing.server";
import { createMpPixCharge, getMpToken } from "./mercadopago.server";
import { withCycleLock } from "./job-lock.server";

type PixOutcome =
  | { type:"pix";code:string;expiresAt:string;amountCents:number;discountCents:number;planName:string }
  | { type:"credited" }
  | { type:"wallet" }
  | { type:"retry" };

async function buildPix(userId:string, requestedPackage?:string):Promise<PixOutcome> {
  const { wallet,subscription } = await getBillingState(userId);
  const hasPaidPlan=!!subscription && ["monthly","quarterly","yearly"].includes(subscription.plan);
  // Present package selection before creating any Mercado Pago charge.
  if(wallet!==null && !hasPaidPlan && !requestedPackage)return {type:"wallet"};
  const packageId=requestedPackage && /^credits_(10|30|50)$/.test(requestedPackage)
    ? requestedPackage : null;
  if(requestedPackage && (!packageId || wallet===null)){
    throw new Error("Pacote inválido para esta conta.");
  }
  // Admins must be able to test a self-requested PIX checkout too.
  // This only prepares a Mercado Pago charge for the account that owns
  // the linked private Telegram chat; it never changes admin privileges.
  // The actual subscription remains activated only after provider approval.
  const selectedPlan=packageId ?? (hasPaidPlan ? subscription!.plan : "monthly");
  const plan=PLANS.find(p=>p.id===selectedPlan) || CREDIT_PACKS.find(p=>p.id===selectedPlan);
  if(!plan)throw new Error("Plano ou pacote não configurado.");
  // Match the existing website's published credit-pack calculation.
  const amountCents=packageId
    ? (plan.credits??0) * ((plan.credits??0)>=50 ? 500 : 600)
    : effectivePriceCents(plan);
  const discountEligible=!packageId;
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
      amount_cents:amountCents,gross_amount_cents:discountEligible?amountCents:null,referral_discount_cents:0,
      currency:"BRL",plan:selectedPlan,payment_type:"subscription",expires_at:expiresAt
    } as never).select("id,amount_cents,referral_discount_cents,expires_at").single();
    if(createError||!created)throw new Error("Não foi possível abrir a cobrança Pix.");
    let payable=amountCents;
    let discount=0;
    if(discountEligible){
      const {data:reserved,error:discountError}=await (supabaseAdmin as any)
        .rpc("reserve_referral_discount",{_payment_id:created.id});
      if(discountError)throw new Error("Não foi possível calcular o desconto de indicação.");
      payable=Number(reserved?.[0]?.amount_to_pay_cents??amountCents);
      discount=Number(reserved?.[0]?.discount_cents??0);
      if(payable===0){
        const {data:finalized,error:finalizeError}=await (supabaseAdmin as any)
          .rpc("finalize_referral_credit_payment",{_payment_id:created.id});
        if(finalizeError||!finalized?.[0]?.applied)throw new Error("Falha na renovação com crédito.");
        return {type:"credited"};
      }
    }
    pending={
      ...created,
      amount_cents:payable,
      referral_discount_cents:discount,
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

export async function generateTelegramPix(userId:string, packageAmount?:number):Promise<string> {
  if(!/^[0-9a-f-]{36}$/i.test(userId))throw new Error("Usuário inválido.");
  const pack = packageAmount == null ? undefined : "credits_" + packageAmount;
  const result=await withCycleLock(`tg-pix-${userId}`,60,()=>buildPix(userId,pack));
  if("skipped" in result)return "⏳ Já estamos gerando seu Pix. Tente /pix novamente em alguns segundos.";
  if(result.type==="wallet"){
    const small=CREDIT_PACKS.filter(p=>[10,30,50].includes(p.credits??0));
    const prices=small.map(p=>`• <b>${p.credits} créditos:</b> ${formatBRL((p.credits??0)*((p.credits??0)>=50?500:600))} — /pix ${p.credits}`).join("\n");
    return `🪙 <b>Escolha um pacote de créditos</b>\n\n`+
      `Sua revenda utiliza créditos sem vencimento mensal.\n`+
      `Escolha um pacote para gerar o Pix:\n\n${prices}\n\n`+
      `Outras quantidades devem ser consultadas diretamente no painel.\n`+
      `Também é possível pagar em https://streammonitor.site/app/subscription`;
  }
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
