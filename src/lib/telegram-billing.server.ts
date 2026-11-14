/**
 * Telegram billing center: reminders and self-service invoice lookup.
 * A billing message must never be sent to Telegram groups, unlinked chats,
 * paused channels, or accounts that opted out of reminders.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { effectivePriceCents, formatBRL, PLANS } from "./payments";

const BILLING_PANEL = "https://streammonitor.site/app/subscription";
const FORTALEZA = "America/Fortaleza";
type Subscription = {
  id: string; user_id: string; plan: string; status: string; expires_at: string;
};
type PrivateChannel = { id:string; owner_id:string; target:string; chatId:string };

const esc = (value: unknown) => String(value ?? "").replace(/[<>&]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]!));
const validDate = (iso:string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone:FORTALEZA, day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
});
const dayAtFortaleza = (d:Date) => {
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:FORTALEZA,year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(d);
  const part=(name:string)=>Number(parts.find(p=>p.type===name)?.value??0);
  return Date.UTC(part("year"),part("month")-1,part("day"))/86400000;
};
export function daysUntil(iso:string,now=new Date()):number {
  return Math.round(dayAtFortaleza(new Date(iso))-dayAtFortaleza(now));
}
export function privateTelegramChat(raw: string): string|null {
  const id=raw.trim().split(":").at(-1)?.trim()??"";
  // Telegram group IDs are negative. Billing includes personal account details.
  return /^[1-9][0-9]{4,15}$/.test(id)?id:null;
}
const PAID_PLANS = new Set(["monthly","quarterly","yearly"]);

export async function getBillingState(userId:string) {
  const [{data:subscription,error:subError},{data:wallet,error:walletError}] = await Promise.all([
    supabaseAdmin.from("subscriptions")
      .select("id,user_id,plan,status,expires_at")
      .eq("user_id",userId).order("expires_at",{ascending:false}).limit(1).maybeSingle(),
    supabaseAdmin.from("reseller_wallet")
      .select("credits").eq("reseller_id",userId).maybeSingle(),
  ]);
  if(subError||walletError)throw new Error("billing_state_unavailable");
  return {subscription:subscription as Subscription|null,wallet:wallet?.credits??null};
}

export async function getBillingPreference(userId:string) {
  const {data,error}=await (supabaseAdmin as any)
    .from("telegram_billing_preferences").select("enabled").eq("user_id",userId).maybeSingle();
  if(error)throw new Error("billing_preference_unavailable");
  return data?.enabled!==false;
}
export async function setBillingPreference(userId:string,enabled:boolean) {
  const {error}=await (supabaseAdmin as any).from("telegram_billing_preferences")
    .upsert({user_id:userId,enabled,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(error)throw new Error("billing_preference_update_failed");
}

function planName(plan:string):string {
  return ({monthly:"Mensal",quarterly:"Trimestral",yearly:"Anual",trial:"Teste gratuito"})[plan]??"Plano";
}

export async function formatTelegramInvoice(userId:string):Promise<string> {
  const {subscription:sub,wallet}=await getBillingState(userId);
  if(wallet!==null && (!sub || !PAID_PLANS.has(sub.plan))) {
    return `🧾 <b>Carteira do revendedor — Stream Monitor</b>\n\n`+
      `🪙 Créditos disponíveis: <b>${wallet}</b>\n`+
      `O modelo de créditos não tem uma mensalidade com vencimento automático.\n\n`+
      `Para adquirir créditos, acesse <a href="${BILLING_PANEL}">Minha Assinatura</a>.\n`+
      `O pagamento só é confirmado depois da aprovação pelo provedor.`;
  }
  if(!sub){
    return `🧾 <b>Fatura digital — Stream Monitor</b>\n\n`+
      `Você ainda não tem uma assinatura cadastrada.\n`+
      `Plano mensal: ${formatBRL(effectivePriceCents(PLANS.find(p=>p.id==="monthly")!))}.\n`+
      `Digite /pix para gerar o pagamento ou acesse <a href="${BILLING_PANEL}">Minha Assinatura</a>.`;
  }
  const days=daysUntil(sub.expires_at);
  const expired=days<0||sub.status==="expired"||sub.status==="cancelled";
  const label=sub.plan==="trial"?"Teste":planName(sub.plan);
  let summary=expired?"🔴 Vencida":days===0?"🟠 Vence hoje":days<=7?"🟡 Próxima do vencimento":"🟢 Dentro do prazo";
  if(sub.status==="cancelled")summary="⚪ Cancelada";
  const plan=PLANS.find(p=>p.id===sub.plan);
  const price=plan?`\n💰 Preço de tabela: <b>${formatBRL(effectivePriceCents(plan))}</b> (descontos calculados no pagamento).`:"";
  return `🧾 <b>Fatura digital — Stream Monitor</b>\n\n`+
    `📦 Plano: <b>${esc(label)}</b>\n`+
    `📆 Vencimento: <b>${validDate(sub.expires_at)}</b>\n`+
    `Status: <b>${summary}</b>${price}\n\n`+
    `💠 Para renovar, digite /pix ou acesse <a href="${BILLING_PANEL}">Minha Assinatura</a>.\n`+
    `A confirmação do pagamento é automática pelo Mercado Pago; não envie comprovante.`;
}

function reminderPhase(days:number):string|null {
  if(days===7)return "due-7";
  if(days===3)return "due-3";
  if(days===1)return "due-1";
  if(days===0)return "due-today";
  if(days===-1)return "expired-1";
  if(days===-3)return "expired-3";
  if(days===-7)return "expired-7";
  if(days===-14)return "expired-14";
  if(days<=-21)return "reactivation-once";
  return null;
}
function remindText(sub:Subscription,days:number):string {
  const plan=planName(sub.plan);
  const when=validDate(sub.expires_at);
  const title=days>0?`⏰ <b>Sua assinatura vence em ${days} dia${days===1?"":"s"}</b>`
    :days===0?"⚠️ <b>Sua assinatura vence hoje</b>":
    "🔴 <b>Sua assinatura Stream Monitor está vencida</b>";
  return `${title}\n\n📦 Plano: <b>${esc(plan)}</b>\n📅 Vencimento: <b>${when}</b>\n`+
    (days<0?"💙 Volte a monitorar seus DNS e servidores renovando sua assinatura.\n":"💙 Renove com antecedência e evite a pausa do monitoramento.\n")+
    `\n🧾 Confira /fatura ou solicite /pix diretamente neste Telegram.\n`+
    `🔒 <a href="${BILLING_PANEL}">Abrir fatura no painel</a>\n\n`+
    `O pagamento é confirmado automaticamente pelo Mercado Pago.\n`+
    `Para deixar de receber lembretes: /avisos_off`;
}

async function registeredPrivateChannels():Promise<PrivateChannel[]> {
  const {data,error}=await supabaseAdmin.from("alert_channels")
    .select("id,owner_id,target").eq("kind","telegram").eq("enabled",true);
  if(error)throw new Error("billing_telegram_channels_unavailable");
  const list=(data??[]).flatMap(channel=>{
    const chatId=privateTelegramChat(channel.target);
    return chatId?[{...channel,chatId}]:[];
  });
  // Do not send private invoice data to a chat linked to two different owners.
  const ownersByChat=new Map<string,Set<string>>();
  for(const ch of list)ownersByChat.set(ch.chatId,(ownersByChat.get(ch.chatId)??new Set<string>()).add(ch.owner_id));
  return list.filter(ch=>ownersByChat.get(ch.chatId)?.size===1);
}

export async function enqueueDailyTelegramBillingReminders() {
  const channels=await registeredPrivateChannels();
  const owners=[...new Set(channels.map(ch=>ch.owner_id))];
  if(!owners.length)return {candidates:0,queued:0,skipped:0,errors:0};
  const [{data:subs,error:subsError},{data:prefs,error:prefsError},{data:wallets,error:walletError},{data:admins,error:adminError}]=await Promise.all([
    supabaseAdmin.from("subscriptions").select("id,user_id,plan,status,expires_at").in("user_id",owners),
    (supabaseAdmin as any).from("telegram_billing_preferences").select("user_id,enabled").in("user_id",owners),
    supabaseAdmin.from("reseller_wallet").select("reseller_id,credits").in("reseller_id",owners),
    supabaseAdmin.from("user_roles").select("user_id").in("user_id",owners).eq("role","admin"),
  ]);
  if(subsError||prefsError||walletError||adminError)throw new Error("billing_query_failed");
  const noReminder=new Set((prefs??[]).filter((p:any)=>p.enabled===false).map((p:any)=>p.user_id));
  const adminIds=new Set((admins??[]).map(p=>p.user_id));
  const walletMap=new Map((wallets??[]).map(w=>[w.reseller_id,w.credits]));
  const latest=new Map<string,Subscription>();
  for(const sub of (subs??[]) as Subscription[]){
    const old=latest.get(sub.user_id);
    if(!old||new Date(sub.expires_at)>new Date(old.expires_at))latest.set(sub.user_id,sub);
  }
  let queued=0,skipped=0,errors=0;
  const now=new Date();
  for(const channel of channels){
    if(noReminder.has(channel.owner_id)||adminIds.has(channel.owner_id)){skipped++;continue;}
    const sub=latest.get(channel.owner_id);
    const wallet=walletMap.get(channel.owner_id);
    let stage:string|null=null;
    let message:string|null=null;
    let keyId:string;
    if(wallet!==undefined && (!sub||!PAID_PLANS.has(sub.plan))){
      if(wallet===0){stage="wallet-empty";message=`🪙 <b>Seus créditos do Stream Monitor acabaram.</b>\n\nRecarregue pelo painel: ${BILLING_PANEL}\n\nPara desativar avisos de cobrança: /avisos_off`;}
      else if(wallet<=2){stage="wallet-low";message=`🟡 <b>Saldo baixo de créditos</b>\n\nRestam <b>${wallet}</b> crédito(s). Para recarregar: ${BILLING_PANEL}\n\nPara desativar avisos de cobrança: /avisos_off`;}
      // This reminder is once per credit state (not every morning).
      keyId=`wallet:${channel.owner_id}:qty-${wallet}`;
    } else if(sub && PAID_PLANS.has(sub.plan) && sub.status!=="cancelled"){
      const days=daysUntil(sub.expires_at,now);
      stage=reminderPhase(days);
      if(stage)message=remindText(sub,days);
      keyId=`sub:${sub.id}`;
    } else if(sub && sub.plan==="trial" && sub.status!=="cancelled") {
      const days=daysUntil(sub.expires_at,now);
      // A free trial is NOT an unpaid invoice. Invite renewal on day of
      // expiry, one day later, and once for historical inactive trials.
      if(days===0 || days===-1 || days<=-7) {
        stage=days===0?"trial-today":days===-1?"trial-ended":"trial-reactivation-once";
        message=`💙 <b>Seu teste gratuito do Stream Monitor terminou</b>\n\n`+
          `Você pode continuar recebendo alertas e acompanhando seus servidores com o plano mensal de ${formatBRL(effectivePriceCents(PLANS.find(p=>p.id==="monthly")!))}.\n\n`+
          `Digite /fatura para consultar as opções ou /pix para gerar o código de pagamento.\n`+
          `🔒 <a href="${BILLING_PANEL}">Assinar pelo painel</a>\n\n`+
          `Isto é um convite para contratar, não uma dívida de teste. Para parar avisos: /avisos_off`;
      }
      keyId=`trial:${sub.id}`;
    } else {skipped++;continue;}
    if(!message||!stage){skipped++;continue;}
    const key=`billing:${keyId}:${stage}:${channel.id}`;
    const {data:result,error}=await (supabaseAdmin as any).from("telegram_outbox").upsert({
      idempotency_key:key,target:channel.target,text:message,source:"billing_reminder",
      status:"pending", attempts:0,max_attempts:6,
      next_attempt_at:new Date().toISOString(),
      channel_id:channel.id,alert_event:stage,
    },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id");
    if(error){errors++;console.error("[billing] enqueue",error.code);continue;}
    if(result?.length)queued++;else skipped++;
  }
  return {candidates:channels.length,queued,skipped,errors};
}

/**
 * Called only after Mercado Pago is verified and finalize_approved_payment
 * commits. A duplicate webhook cannot produce a duplicate Telegram receipt.
 */
export async function enqueueTelegramPaymentApproved(input:{
  userId:string;paymentId:string;plan:string|null;amountCents:number;expiresAt?:string|null
}) {
  if(!input.userId || !input.paymentId)return {queued:0};
  if(!await getBillingPreference(input.userId))return {queued:0};
  const channels=(await registeredPrivateChannels()).filter(ch=>ch.owner_id===input.userId);
  if(!channels.length)return {queued:0};
  const title=input.plan==="monthly"?"mensal":input.plan==="quarterly"?"trimestral":input.plan==="yearly"?"anual":"Stream Monitor";
  const message=`✅ <b>Pagamento confirmado — Stream Monitor</b>\n\n`+
    `💰 Valor: <b>${formatBRL(input.amountCents)}</b>\n`+
    `📦 Plano: <b>${esc(title)}</b>\n`+
    (input.expiresAt?`📅 Novo vencimento: <b>${validDate(input.expiresAt)}</b>\n`:"")+
    `\nSeu pagamento foi confirmado automaticamente pelo Mercado Pago.\n`+
    `Consulte /fatura para ver sua assinatura ou acesse <a href="${BILLING_PANEL}">Minha Assinatura</a>.`;
  let queued=0;
  for(const ch of channels){
    const key=`billing-paid:${input.paymentId}:${ch.id}`;
    const {data,error}=await (supabaseAdmin as any).from("telegram_outbox").upsert({
      idempotency_key:key,target:ch.target,text:message,source:"billing_payment",
      status:"pending",attempts:0,max_attempts:6,
      next_attempt_at:new Date().toISOString(),channel_id:ch.id,alert_event:"paid",
    },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id");
    if(error)throw new Error("payment_confirmation_queue_failed");
    if(data?.length)queued++;
  }
  return {queued};
}
