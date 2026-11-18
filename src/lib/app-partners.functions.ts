import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

type PartnerInput={slug:string};
type AdminPartnerInput={partnerId:string};
type PartnerUpdate={partnerId:string;name?:string;accentColor?:string;apiKind?:"unverified"|"statuspage_v2"|"simple_status";monitorEnabled?:boolean;broadcastEnabled?:boolean;commissionRateBps?:number;renewals?:boolean};
const db=async()=> (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const cleanSlug=(s:string)=>/^[a-z0-9][a-z0-9-]{1,47}$/.test(String(s||""))?s:"";
const moneyFields="id,slug,name,logo_url,accent_color,website_url,api_url,api_kind,partnership_status,monitor_enabled,broadcast_enabled,status,last_check_at,last_healthy_at,last_error,commission_rate_bps,commission_on_renewals";

async function verifyAdmin(userId:string){
 const client=await db();
 const {data, error}=await client.rpc("has_role",{_user_id:userId,_role:"admin"});
 if(!error&&data)return;
 const {data:adminUser}=await client.auth.admin.getUserById(userId);
 const {isAdminMaster}=await import("@/lib/permissions");
 if(!isAdminMaster(adminUser?.user?.email))throw new Error("Acesso restrito ao administrador.");
}
const safeErr=(x:any)=>{if(x?.error)throw new Error("Consulta indisponível.");return x.data;};

/** Landing page: only the brand data explicitly approved for public display. */
export const getPublicPartner=createServerFn({method:"GET"})
 .inputValidator((x:PartnerInput)=>({slug:cleanSlug(x.slug)}))
 .handler(async({data})=>{
  if(!data.slug)return null;
  const client=await db();
  const {data:partner,error}=await client.from("app_partners")
   .select("slug,name,logo_url,accent_color,website_url,partnership_status")
   .eq("slug",data.slug).eq("partnership_status","active").maybeSingle();
  if(error||!partner)return null;
  return partner as {slug:string;name:string;logo_url:string|null;accent_color:string;website_url:string|null};
 });

export const getPublicAppStatuses=createServerFn({method:"GET"}).handler(async()=>{
 const client=await db();
 const {data,error}=await client.from("app_partners")
  .select("slug,name,logo_url,status,last_check_at,api_kind,monitor_enabled")
  .eq("partnership_status","active").order("name");
 if(error)throw new Error("Status indisponível");
 return (data||[]).map((p:any)=>({
  slug:p.slug,name:p.name,logoUrl:p.logo_url,
  status:p.monitor_enabled&&p.api_kind!=="unverified"?p.status:"unverified",
  lastCheckAt:p.last_check_at
 }));
});

/** A partner can only see their own financial data, checked by server membership. */
export const getAppPartnerDashboard=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth]).handler(async({context})=>{
  const client=await db();
  const {data:members,error:memErr}=await client.from("app_partner_members")
   .select("partner_id,role").eq("user_id",context.userId);
  if(memErr)throw new Error("Não foi possível verificar o acesso do parceiro");
  if(!members?.length)return {partner:null};
  const partnerId=members[0].partner_id;
  const [partnerResult,referralsResult,commissionsResult,payoutsResult,checksResult]=await Promise.all([
   client.from("app_partners").select(moneyFields).eq("id",partnerId).single(),
   client.from("app_partner_referrals").select("id,created_at").eq("partner_id",partnerId).order("created_at",{ascending:false}).limit(5000),
   client.from("app_partner_commissions").select("id,amount_cents,paid_amount_cents,stream_monitor_cents,created_at,reversed_at").eq("partner_id",partnerId).order("created_at",{ascending:false}).limit(5000),
   client.from("app_partner_payout_requests").select("id,amount_cents,status,requested_at,paid_at").eq("partner_id",partnerId).order("requested_at",{ascending:false}).limit(5000),
   client.from("app_partner_health_checks").select("checked_at,status,evidence,latency_ms").eq("partner_id",partnerId).order("checked_at",{ascending:false}).limit(20)
  ]);
  for(const r of [partnerResult,referralsResult,commissionsResult,payoutsResult,checksResult])safeErr(r);
  const partner=partnerResult.data;
  const referrals=referralsResult.data??[];
  const commissions=commissionsResult.data??[];
  const payouts=payoutsResult.data??[];
  const activeCommissions=commissions.filter((r:any)=>!r.reversed_at);
  const earnedCents=activeCommissions.reduce((n:number,r:any)=>n+Number(r.amount_cents),0);
  const grossCents=activeCommissions.reduce((n:number,r:any)=>n+Number(r.paid_amount_cents),0);
  const paidCents=payouts.filter((p:any)=>p.status==="paid").reduce((n:number,p:any)=>n+Number(p.amount_cents),0);
  const reservedCents=payouts.filter((p:any)=>p.status==="requested"||p.status==="approved").reduce((n:number,p:any)=>n+Number(p.amount_cents),0);
  const today=Date.now();
  const recent=(days:number)=>referrals.filter((r:any)=>new Date(r.created_at).getTime()>=today-days*86400000).length;
  return {
   partner, role:members[0].role,
   metrics:{registered:referrals.length,conversions:activeCommissions.length,
    grossCents,earnedCents,paidCents,reservedCents,availableCents:Math.max(0,earnedCents-paidCents-reservedCents),
    new7d:recent(7),new30d:recent(30)},
   commissions:commissions.slice(0,30).map((c:any)=>({
    id:c.id,at:c.created_at,orderCents:c.paid_amount_cents,commissionCents:c.amount_cents,reversed:!!c.reversed_at
   })),
   payouts:payouts.slice(0,30),
   checks:checksResult.data??[],
   truncated:referrals.length===5000||commissions.length===5000||payouts.length===5000
  };
 });

export const requestAppPartnerPayout=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((x:{partnerId:string;amountCents:number;pixKey:string})=>{
  if(!/^[0-9a-f-]{36}$/i.test(x.partnerId)||!Number.isSafeInteger(x.amountCents)||x.amountCents<=0||
   typeof x.pixKey!=="string"||x.pixKey.trim().length<3||x.pixKey.trim().length>128)throw new Error("Solicitação inválida.");
  return x;
 })
 .handler(async({context,data})=>{
  const {data:id,error}=await context.supabase.rpc("request_app_partner_payout" as any,{
   _partner_id:data.partnerId,_amount_cents:data.amountCents,_pix_key:data.pixKey.trim()
  });
  if(error||!id)throw new Error("Saldo indisponível ou solicitação inválida.");
  return {id};
 });

export const getAdminAppPartners=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth]).handler(async({context})=>{
  await verifyAdmin(context.userId);
  const client=await db();
  const [partners,referrals,commissions,payouts,members]=await Promise.all([
   client.from("app_partners").select(moneyFields).order("created_at",{ascending:false}),
   client.from("app_partner_referrals").select("partner_id,created_at").limit(5000),
   client.from("app_partner_commissions").select("partner_id,amount_cents,reversed_at,paid_amount_cents").limit(5000),
   client.from("app_partner_payout_requests").select("id,partner_id,amount_cents,status,requested_at,pix_key,requested_by,payment_reference,paid_at").order("requested_at",{ascending:false}).limit(1000),
   client.from("app_partner_members").select("partner_id,user_id,role").limit(1000)
  ]);
  for(const r of [partners,referrals,commissions,payouts,members])safeErr(r);
  return {partners:partners.data??[],referrals:referrals.data??[],
   commissions:commissions.data??[],payouts:payouts.data??[],members:members.data??[]};
 });

export const createAppPartner=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((x:{slug:string;name:string;apiUrl?:string})=>{
  if(!cleanSlug(x.slug)||!x.name?.trim()||x.name.length>90)throw new Error("Dados do parceiro inválidos.");
  if(x.apiUrl && (!x.apiUrl.startsWith("https://")||x.apiUrl.length>500))throw new Error("API inválida.");
  return x;
 })
 .handler(async({context,data})=>{
  await verifyAdmin(context.userId);
  const client=await db();
  const {data:p,error}=await client.from("app_partners").insert({
   slug:data.slug,name:data.name.trim(),api_url:data.apiUrl?.trim()||null,
   monitor_enabled:false,broadcast_enabled:false,api_kind:"unverified"
  }).select("id,slug").single();
  if(error)throw new Error("Não foi possível cadastrar o parceiro. Verifique se o link já existe.");
  return p;
 });

export const updateAppPartner=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((x:PartnerUpdate)=>x)
 .handler(async({context,data})=>{
  await verifyAdmin(context.userId);
  const client=await db();
  const {data:existing,error:loadError}=await client.from("app_partners").select("id,api_kind,api_url,broadcast_enabled,monitor_enabled")
   .eq("id",data.partnerId).single();
  if(loadError||!existing)throw new Error("Parceiro não encontrado.");
  const update:any={updated_at:new Date().toISOString()};
  if(data.name!==undefined){if(!data.name.trim()||data.name.length>90)throw new Error("Nome inválido");update.name=data.name.trim();}
  if(data.accentColor!==undefined){if(!/^#[0-9a-f]{6}$/i.test(data.accentColor))throw new Error("Cor inválida");update.accent_color=data.accentColor;}
  if(data.commissionRateBps!==undefined){if(!Number.isInteger(data.commissionRateBps)||data.commissionRateBps<0||data.commissionRateBps>10000)throw new Error("Percentual inválido");update.commission_rate_bps=data.commissionRateBps;}
  if(data.renewals!==undefined)update.commission_on_renewals=data.renewals;
  if(data.apiKind!==undefined)update.api_kind=data.apiKind;
  const kind=data.apiKind||existing.api_kind;
  if(data.monitorEnabled!==undefined){
   if(data.monitorEnabled && kind==="unverified")throw new Error("Valide o formato da API antes de ativar o monitoramento.");
   update.monitor_enabled=data.monitorEnabled;
  }
  if(data.broadcastEnabled!==undefined){
   if(data.broadcastEnabled && (kind==="unverified"||!(data.monitorEnabled??existing.monitor_enabled)))
    throw new Error("Ative e valide o monitoramento antes dos alertas globais.");
   update.broadcast_enabled=data.broadcastEnabled;
  }
  const {error}=await client.from("app_partners").update(update).eq("id",data.partnerId);
  if(error)throw new Error("Falha ao atualizar a parceria.");
  return {ok:true};
 });

export const assignAppPartnerOwner=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((x:{partnerId:string;email:string})=>x)
 .handler(async({context,data})=>{
  await verifyAdmin(context.userId);
  if(!/^[0-9a-f-]{36}$/i.test(data.partnerId)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw new Error("Dados inválidos");
  const client=await db();
  const {data:profile,error:lookupError}=await client.from("profiles").select("id").eq("email",data.email.toLowerCase().trim()).maybeSingle();
  if(lookupError||!profile)throw new Error("O dono do aplicativo precisa primeiro ter uma conta cadastrada no Stream Monitor.");
  const {error}=await client.from("app_partner_members").upsert({
    partner_id:data.partnerId,user_id:profile.id,role:"owner"
  },{onConflict:"partner_id,user_id"});
  if(error)throw new Error("Não foi possível vincular a conta.");
  return {ok:true};
 });

export const markPartnerPayoutPaid=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((x:{payoutId:string;reference:string})=>x)
 .handler(async({context,data})=>{
  await verifyAdmin(context.userId);
  if(!/^[0-9a-f-]{36}$/i.test(data.payoutId)||!data.reference?.trim()||data.reference.length>150)
   throw new Error("Informe o comprovante ou identificador da transferência.");
  const client=await db();
  const {data:updated,error}=await client.from("app_partner_payout_requests").update({
   status:"paid",payment_reference:data.reference.trim(),paid_at:new Date().toISOString(),
   reviewed_by:context.userId,reviewed_at:new Date().toISOString()
  }).eq("id",data.payoutId).in("status",["requested","approved"]).select("id").maybeSingle();
  if(error||!updated)throw new Error("Saque já processado ou indisponível.");
  return {ok:true};
 });
