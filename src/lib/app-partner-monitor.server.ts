import {supabaseAdmin} from "@/integrations/supabase/client.server";

type ReportedStatus="online"|"degraded"|"offline"|"unknown";
type ApplicationComponent={id:string;name:string;status:ReportedStatus;uptime30d:number|null};
type Result={status:ReportedStatus;evidence:string;httpStatus:number|null;latencyMs:number;providerStatus:string|null;components?:ApplicationComponent[];stability30d?:number|null;incidents30d?:number|null;providerUpdatedAt?:string|null};
const statuses={
 none:"online",operational:"online",healthy:"online",up:"online",online:"online",ok:"online",
 minor:"degraded",major:"degraded",degraded:"degraded",partial_outage:"degraded",
 degraded_performance:"degraded",partial:"degraded",maintenance:"unknown",
 critical:"offline",down:"offline",offline:"offline",major_outage:"offline",
 all_systems_operational:"online"
} as Record<string,ReportedStatus>;
const validUrl=(uri:string)=>{
 try{
  const url=new URL(uri);
  const host=url.hostname.toLowerCase();
  return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&!url.search
   &&host.includes(".")&&!host.endsWith(".local")&&!host.endsWith(".internal")
   &&host!=="localhost"&&!/^(\d{1,3}\.){3}\d{1,3}$/.test(host)&&!host.includes(":");
 }catch{return false;}
};
export function interpretApplicationStatus(json:unknown,kind:string):{
 status:ReportedStatus;evidence:string;providerStatus:string|null;components:ApplicationComponent[];
 stability30d:number|null;incidents30d:number|null;providerUpdatedAt:string|null
}{
 const fail=(message:string)=>({status:"unknown" as ReportedStatus,evidence:message,providerStatus:null,components:[] as ApplicationComponent[],
  stability30d:null,incidents30d:null,providerUpdatedAt:null});
 if(!json||typeof json!=="object"||Array.isArray(json))return fail("API não forneceu um objeto JSON de status");
 const obj=json as Record<string,any>;
 const raw=kind==="statuspage_v2"?obj.status?.indicator:obj.status;
 if(typeof raw!=="string")return fail("Campo status ausente no contrato de API");
 const status=statuses[raw.toLowerCase().trim()]||"unknown";
 if(kind!=="rx_purple"){
  return {status,evidence:status==="unknown"?"Indicador não reconhecido":"Status declarado pelo provedor: "+raw,
   providerStatus:raw.slice(0,64),components:[],stability30d:null,incidents30d:null,providerUpdatedAt:null};
 }
 // API RX Purple verified 2026-11-18: ok,status,stability_30d,incidents_30d,services,updated_at.
 if(obj.ok!==true||!Array.isArray(obj.services)||obj.services.length<1||obj.services.length>30)
  return fail("API RX Purple incompleta: ok=true e services[] são necessários");
 const components:ApplicationComponent[]=[];
 for(const svc of obj.services){
  if(!svc||typeof svc!=="object"||typeof svc.id!=="string"||!/^[a-zA-Z0-9_-]{1,48}$/.test(svc.id)||
   typeof svc.name!=="string"||typeof svc.status!=="string")return fail("Componente RX Purple inválido");
  const st=statuses[svc.status.toLowerCase().trim()]||"unknown";
  const uptime=typeof svc.uptime_30d==="number"&&svc.uptime_30d>=0&&svc.uptime_30d<=100?svc.uptime_30d:null;
  components.push({id:svc.id,name:svc.name.slice(0,80),status:st,uptime30d:uptime});
 }
 if(status==="unknown"||components.some(c=>c.status==="unknown"))return fail("Status desconhecido na API; sem alerta global");
 const affected=components.filter(c=>c.status!=="online");
 const overall:ReportedStatus=status==="offline"||affected.length===components.length?"offline":
  status==="degraded"||affected.length?"degraded":"online";
 const evidence=overall==="online"?"RX Purple confirma operação de: "+components.map(c=>c.name).join(", ").slice(0,150)
  :"Serviços afetados segundo RX Purple: "+affected.map(c=>c.name+" ("+c.status+")").join(", ").slice(0,155);
 return {status:overall,evidence:evidence.slice(0,230),providerStatus:raw.slice(0,64),components,
  stability30d:typeof obj.stability_30d==="number"&&obj.stability_30d>=0&&obj.stability_30d<=100?obj.stability_30d:null,
  incidents30d:Number.isSafeInteger(obj.incidents_30d)&&obj.incidents_30d>=0?obj.incidents_30d:null,
  providerUpdatedAt:typeof obj.updated_at==="string"&&Number.isFinite(Date.parse(obj.updated_at))?obj.updated_at:null};
}
export async function probeApplicationApi(apiUrl:string,apiKind:string):Promise<Result>{
 const started=Date.now();
 if(!validUrl(apiUrl))return {status:"unknown",evidence:"Endereço HTTPS inválido ou inseguro",httpStatus:null,latencyMs:0,providerStatus:null};
 try{
  const res=await fetch(apiUrl,{
   method:"GET",redirect:"error",headers:{"accept":"application/json","user-agent":"StreamMonitor-Partner-Health/1.0"},
   signal:AbortSignal.timeout(9000),
  });
  const elapsed=Date.now()-started;
  if(res.status!==200)return {status:"unknown",evidence:"API respondeu HTTP "+res.status+"; isso não prova queda do aplicativo",httpStatus:res.status,latencyMs:elapsed,providerStatus:null};
  const contentType=res.headers.get("content-type")||"";
  if(!contentType.toLowerCase().includes("json"))
   return {status:"unknown",evidence:"API retornou conteúdo que não é JSON",httpStatus:res.status,latencyMs:elapsed,providerStatus:null};
  const text=(await res.text()).slice(0,64000);
  let json:any;
  try{json=JSON.parse(text);}catch{return {status:"unknown",evidence:"Resposta JSON inválida",httpStatus:res.status,latencyMs:elapsed,providerStatus:null};}
  const output=interpretApplicationStatus(json,apiKind);
  return {...output,httpStatus:res.status,latencyMs:elapsed};
 }catch{
  return {status:"unknown",evidence:"API inacessível ou resposta expirada; indisponibilidade do aplicativo não comprovada",httpStatus:null,latencyMs:Date.now()-started,providerStatus:null};
 }
}
type Partner={
 id:string;name:string;api_url:string|null;api_kind:string;status:ReportedStatus;
 broadcast_enabled:boolean;consecutive_healthy:number;consecutive_unhealthy:number;last_healthy_at:string|null;
};
function esc(v:string){return v.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
async function enqueueGlobalApplicationEvent(partner:Partner,incidentId:string,kind:"down"|"up",at:string,evidence:string){
 const db=supabaseAdmin as any;
 const {data:channels,error}=await db.from("alert_channels")
  .select("id,target,owner_id").eq("kind","telegram").eq("enabled",true);
 if(error)throw new Error("global_telegram_channels_unavailable");
 if(!channels?.length)return {enqueued:0};
 const stamp=new Date(at).toLocaleString("pt-BR",{timeZone:"America/Fortaleza"});
 const name=esc(partner.name).slice(0,80);
 const description=esc(evidence).slice(0,220);
 const message=kind==="down"
  ?("🔴 <b>STREAM MONITOR — ALERTA DE APLICATIVO</b>\n\n📱 Aplicativo: <b>"+name+"</b>\n⚠️ Instabilidade confirmada na API oficial\n🔎 "+description+"\n🕒 "+stamp+"\n\n💙 Stream Monitor — Mais informação para o seu suporte.")
  :("🟢 <b>STREAM MONITOR — APLICATIVO NORMALIZADO</b>\n\n📱 Aplicativo: <b>"+name+"</b>\n✅ API oficial voltou a indicar funcionamento normal\n🔎 "+description+"\n🕒 "+stamp+"\n\n💙 Stream Monitor — Monitoramento inteligente.");
 let enqueued=0;
 for(let offset=0;offset<channels.length;offset+=80){
  const chunk=channels.slice(offset,offset+80).map((c:any)=>({
   idempotency_key:"appstatus:"+incidentId+":"+kind+":"+c.id,
   target:c.target,text:message,channel_id:c.id,source:"app_partner_status",
   status:"pending",attempts:0,max_attempts:7,next_attempt_at:new Date().toISOString(),
   alert_event:"application_"+kind
  }));
  const {error:queueError}=await db.from("telegram_outbox").upsert(chunk,{
   onConflict:"idempotency_key",ignoreDuplicates:true
  });
  if(queueError)throw new Error("application_telegram_queue_failed");
  enqueued+=chunk.length;
 }
 return {enqueued};
}
/**
 * Only provider-declared status can affect incidents.
 * Two consecutive reported failures + a prior healthy baseline are required
 * to broadcast. Transient HTTP errors are "unknown", never mass alerts.
 */
export async function runDueApplicationPartnerChecks(limit=3){
 const db=supabaseAdmin as any;
 const {data:partners,error}=await db.from("app_partners")
  .select("id,name,api_url,api_kind,status,broadcast_enabled,consecutive_healthy,consecutive_unhealthy,last_healthy_at")
  .eq("monitor_enabled",true).eq("partnership_status","active")
  .neq("api_kind","unverified").order("last_check_at",{ascending:true,nullsFirst:true}).limit(Math.min(10,Math.max(1,limit)));
 if(error)throw new Error("application_partner_query_failed");
 let checked=0,confirmedChanges=0,queued=0;
 for(const partner of (partners||[]) as Partner[]){
  if(!partner.api_url)continue;
  const result=await probeApplicationApi(partner.api_url,partner.api_kind);
  checked++;
  const now=new Date().toISOString();
  const {error:checkError}=await db.from("app_partner_health_checks").insert({
   partner_id:partner.id,checked_at:now,http_status:result.httpStatus,
   latency_ms:result.latencyMs,status:result.status,evidence:result.evidence,
   provider_status:result.providerStatus
  });
  if(checkError)throw new Error("application_health_persist_failed");
  if(result.components?.length){
   const {error:componentsError}=await db.from("app_partner_service_statuses").upsert(
    result.components.map(c=>({partner_id:partner.id,service_id:c.id,name:c.name,status:c.status,
     uptime_30d:c.uptime30d,checked_at:now})),{onConflict:"partner_id,service_id"});
   if(componentsError)throw new Error("application_component_update_failed");
  }
  let healthy= result.status==="online"?(partner.consecutive_healthy+1):0;
  let unhealthy= result.status==="offline"||result.status==="degraded"?(partner.consecutive_unhealthy+1):0;
  const update:any={last_check_at:now,consecutive_healthy:healthy,consecutive_unhealthy:unhealthy,
   last_error:result.status==="unknown"?result.evidence:null,updated_at:now,
   ...(result.stability30d!=null?{stability_30d:result.stability30d}:{}),
   ...(result.incidents30d!=null?{incidents_30d:result.incidents30d}:{}),
   ...(result.providerUpdatedAt?{provider_updated_at:result.providerUpdatedAt}:{})};
  const previous=partner.status;
  let transition:"down"|"up"|null=null;
  if(result.status==="online"&&healthy>=2){
   update.status="online";update.last_healthy_at=now;
   if(previous==="offline"||previous==="degraded")transition="up";
  }else if((result.status==="offline"||result.status==="degraded")&&unhealthy>=2){
   update.status=result.status;
   if(previous==="online"&&partner.last_healthy_at)transition="down";
  }else if(result.status==="unknown"&&!partner.last_healthy_at){
   update.status="unknown";
  }
  const {error:updateError}=await db.from("app_partners").update(update).eq("id",partner.id);
  if(updateError)throw new Error("application_status_save_failed");
  if(transition==="down"){
   const {data:existingIncident}=await db.from("app_partner_incidents")
    .select("id").eq("partner_id",partner.id).is("recovered_at",null).maybeSingle();
   let incidentId=existingIncident?.id;
   if(!incidentId){
    const {data:inserted,error:insertError}=await db.from("app_partner_incidents")
      .insert({partner_id:partner.id,severity:result.status,started_evidence:result.evidence,started_at:now})
      .select("id").maybeSingle();
    if(insertError){
     const {data:competing}=await db.from("app_partner_incidents").select("id")
       .eq("partner_id",partner.id).is("recovered_at",null).maybeSingle();
     if(!competing)throw new Error("application_incident_create_failed");
     incidentId=competing.id;
    }else incidentId=inserted?.id;
   }
   if(!incidentId)throw new Error("application_incident_id_missing");
   confirmedChanges++;
   if(partner.broadcast_enabled){
    const out=await enqueueGlobalApplicationEvent(partner,incidentId,"down",now,result.evidence);
    queued+=out.enqueued;
    await db.from("app_partner_incidents").update({alert_enqueued_at:now}).eq("id",incidentId);
   }
  }else if(transition==="up"){
   const {data:incident}=await db.from("app_partner_incidents")
     .select("id,alert_enqueued_at").eq("partner_id",partner.id).is("recovered_at",null)
     .order("started_at",{ascending:false}).limit(1).maybeSingle();
   if(incident){
    const {error:closedError}=await db.from("app_partner_incidents")
      .update({recovered_at:now,recovered_evidence:result.evidence}).eq("id",incident.id);
    if(closedError)throw new Error("application_incident_close_failed");
    confirmedChanges++;
    if(partner.broadcast_enabled&&incident.alert_enqueued_at){
     const out=await enqueueGlobalApplicationEvent(partner,incident.id,"up",now,result.evidence);
     queued+=out.enqueued;
     await db.from("app_partner_incidents").update({recovery_enqueued_at:now}).eq("id",incident.id);
    }
   }
  }
 }
 return {checked,confirmedChanges,telegramQueued:queued};
}
