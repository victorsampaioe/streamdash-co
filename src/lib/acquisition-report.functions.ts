import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

type AcquisitionRow={
  user_id:string;source:string;platform:string|null;campaign_id:string|null;
  utm_campaign:string|null;registered_at:string;
};
type PaidRow={user_id:string;amount_cents:number;paid_at:string;plan:string};
type CostRow={day:string;platform:string;campaign_id:string;ad_id:string;
  spend_cents:number;clicks:number;impressions:number;landing_page_views:number;retrieved_at:string};
type Segment={
  key:string;registrations:number;paidCustomers:number;revenueCents:number;
  activeSubscriptions:number;spendCents:number|null;linkClicks:number|null;
  landingPageViews:number|null;signupPageVisits:number|null;costPerRegistrationCents:number|null;
  costPerPaidCustomerCents:number|null;
};
function makeSegment(key:string):Segment{
  return {key,registrations:0,paidCustomers:0,revenueCents:0,
    activeSubscriptions:0,spendCents:null,linkClicks:null,landingPageViews:null,signupPageVisits:null,
    costPerRegistrationCents:null,costPerPaidCustomerCents:null};
}
function summarize(segment:Segment){
  return {...segment,
    costPerRegistrationCents:segment.spendCents!==null&&segment.registrations>0
      ?Math.round(segment.spendCents/segment.registrations):null,
    costPerPaidCustomerCents:segment.spendCents!==null&&segment.paidCustomers>0
      ?Math.round(segment.spendCents/segment.paidCustomers):null};
}

/** Admin-only join between new consented first-touch records and real
 * approved subscription payments. Historic users remain unassigned.
 * Paid cost observations are labeled as dated Meta snapshots, not live spend.
 */
export const getAdminAcquisitionReport=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data:role,error:roleError}=await supabaseAdmin.rpc("has_role",{
    _user_id:context.userId,_role:"admin"
  });
  if(roleError||!role){
    const {data:adminUser}=await supabaseAdmin.auth.admin.getUserById(context.userId);
    const {isAdminMaster}=await import("@/lib/permissions");
    if(!isAdminMaster(adminUser?.user?.email))throw new Error("Acesso restrito.");
  }
  const [acqQ,payQ,subQ,costQ,totalQ,visitQ]=await Promise.all([
    (supabaseAdmin as any).from("customer_acquisition")
      .select("user_id,source,platform,campaign_id,utm_campaign,registered_at")
      .order("registered_at",{ascending:false}).limit(5000),
    supabaseAdmin.from("payments")
      .select("user_id,amount_cents,paid_at,plan")
      .eq("status","approved").eq("payment_type","subscription")
      .in("plan",["monthly","quarterly","yearly"])
      .not("paid_at","is",null).order("paid_at",{ascending:false}).limit(5000),
    supabaseAdmin.from("subscriptions")
      .select("user_id,expires_at").eq("status","active")
      .gt("expires_at",new Date().toISOString()).limit(5000),
    (supabaseAdmin as any).from("ad_spend_daily")
      .select("day,platform,campaign_id,ad_id,spend_cents,clicks,impressions,landing_page_views,retrieved_at")
      .order("day",{ascending:false}).limit(5000),
    supabaseAdmin.from("profiles").select("id",{head:true,count:"exact"}),
    (supabaseAdmin as any).from("acquisition_page_events")
      .select("stage,source,platform,campaign_id")
      .eq("stage","signup").eq("is_qa",false)
      .gte("created_at",new Date(Date.now()-90*86400000).toISOString())
      .order("created_at",{ascending:false}).limit(5000)
  ]);
  for(const q of [acqQ,payQ,subQ,costQ,totalQ,visitQ])if(q.error)throw new Error("Aquisição indisponível");
  const leads=(acqQ.data||[]) as AcquisitionRow[];
  const payments=(payQ.data||[]) as PaidRow[];
  const costs=(costQ.data||[]) as CostRow[];
  const active=new Set((subQ.data||[]).map(x=>x.user_id));
  const paidByUser=new Map<string,{total:number;first:string}>();
  for(const p of payments){
    if(!p.paid_at||!Number.isSafeInteger(p.amount_cents)||p.amount_cents<=0)continue;
    const existing=paidByUser.get(p.user_id);
    if(existing){existing.total+=p.amount_cents;if(p.paid_at<existing.first)existing.first=p.paid_at;}
    else paidByUser.set(p.user_id,{total:p.amount_cents,first:p.paid_at});
  }
  const group=(map:Map<string,Segment>,key:string)=>{
    let value=map.get(key);
    if(!value){value=makeSegment(key);map.set(key,value);}
    return value;
  };
  const bySource=new Map<string,Segment>();
  const byPlatform=new Map<string,Segment>();
  const byCampaign=new Map<string,Segment>();
  for(const u of leads){
    const source=group(bySource,u.source||"unattributed");
    const platform=u.source==="meta_ads"?(u.platform||"unknown"):"other";
    const platformRow=group(byPlatform,platform);
    const campaignKey=u.campaign_id ? u.campaign_id : (u.utm_campaign ? "utm:"+u.utm_campaign : "unidentified");
    const campaign=group(byCampaign,campaignKey);
    for(const item of [source,platformRow,campaign]){
      item.registrations++;
      if(active.has(u.user_id))item.activeSubscriptions++;
      const payment=paidByUser.get(u.user_id);
      // Do not attribute payments preceding this registered account.
      if(payment&&payment.first>=u.registered_at){
        item.paidCustomers++;item.revenueCents+=payment.total;
      }
    }
  }
  for(const visit of visitQ.data||[]){
    const source=group(bySource,visit.source||"unattributed");
    const platform=group(byPlatform,visit.source==="meta_ads"?(visit.platform||"unknown"):"other");
    const campaign=group(byCampaign,visit.campaign_id||"unidentified");
    for(const x of [source,platform,campaign])x.signupPageVisits=(x.signupPageVisits??0)+1;
  }
  const totalCost=(seg:Segment|undefined,c:CostRow)=>{
    if(!seg)return;
    seg.spendCents=(seg.spendCents??0)+Number(c.spend_cents||0);
    seg.linkClicks=(seg.linkClicks??0)+Number(c.clicks||0);
    seg.landingPageViews=(seg.landingPageViews??0)+Number(c.landing_page_views||0);
  };
  for(const c of costs){
    totalCost(group(bySource,"meta_ads"),c);
    totalCost(group(byPlatform,c.platform||"unknown"),c);
    totalCost(group(byCampaign,c.campaign_id),c);
  }
  const noAttribution=Math.max(0,Number(totalQ.count??0)-leads.length);
  const attributablePaid=leads.filter(x=>{
    const payment=paidByUser.get(x.user_id);
    return payment&&payment.first>=x.registered_at;
  }).length;
  return {
    generatedAt:new Date().toISOString(),
    totals:{profiles:Number(totalQ.count??0),newAttributed:leads.length,
      historicalUnattributed:noAttribution,paidKnown:paidByUser.size,
      paidWithFirstTouch:attributablePaid,
      spendCents:costs.reduce((n,x)=>n+Number(x.spend_cents||0),0),
      signupPageVisits:(visitQ.data||[]).length,
      linkClicks:costs.reduce((n,x)=>n+Number(x.clicks||0),0),
      landingPageViews:costs.reduce((n,x)=>n+Number(x.landing_page_views||0),0)},
    bySource:[...bySource.values()].map(summarize).sort((a,b)=>b.registrations-a.registrations),
    byPlatform:[...byPlatform.values()].map(summarize).sort((a,b)=>(b.spendCents||0)-(a.spendCents||0)),
    byCampaign:[...byCampaign.values()].map(summarize).sort((a,b)=>(b.spendCents||0)-(a.spendCents||0)),
    metaCostsLastImported:costs.map(x=>x.retrieved_at).sort().at(-1)??null,
    note:"Receita atribuída usa primeiro toque informado com consentimento; custo é importação pontual da Meta. Nenhum histórico anterior foi reclassificado.",
  };
});
