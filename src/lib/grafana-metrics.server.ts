/**
 * Grafana Cloud OTLP Metrics exporter. Exports only low-cardinality aggregate
 * health measurements, without hosts, DNS URLs, usernames or credentials.
 * No Grafana calls are made until explicitly configured by the administrator.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db=supabaseAdmin as any;
type ExportResult={enabled:boolean;status:"disabled"|"sent"|"failed";metrics:number;code?:string};

async function count(table:string,modifier?:(query:any)=>any):Promise<number> {
  let q=db.from(table).select("*",{count:"exact",head:true});
  if(modifier)q=modifier(q);
  const {count,error}=await q;
  if(error)throw new Error(`grafana_metric_query_${table}_failed`);
  return Number(count??0);
}
async function updateStatus(status:string) {
  await db.from("observability_integrations").update({
    grafana_last_export_status:status.slice(0,100),
    grafana_last_export_at:new Date().toISOString(),
  }).eq("id",1);
}
export async function exportGrafanaMetrics():Promise<ExportResult> {
  const {data:cfg,error:configError}=await db.from("observability_integrations")
    .select("grafana_endpoint,grafana_stack_id,grafana_enabled").eq("id",1).single();
  if(configError)throw new Error("grafana_configuration_unavailable");
  if(!cfg?.grafana_enabled)return {enabled:false,status:"disabled",metrics:0};
  const endpoint=String(cfg.grafana_endpoint??"");
  const stackId=String(cfg.grafana_stack_id??"");
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||!/^otlp-[a-z0-9-]+\.grafana\.net$/i.test(url.hostname)
    ||url.pathname!=="/otlp"||!/^\d{3,18}$/.test(stackId)){
    await updateStatus("invalid_endpoint");
    return {enabled:true,status:"failed",metrics:0,code:"invalid_endpoint"};
  }
  const {data:token,error:tokenError}=await db.rpc("streammonitor_grafana_token_service");
  if(tokenError||typeof token!=="string"||token.length<16){
    await updateStatus("missing_token");
    return {enabled:true,status:"failed",metrics:0,code:"missing_token"};
  }
  const since=new Date(Date.now()-86_400_000).toISOString();
  let metrics:Record<string,number>;
  try{
    const [
      servers,online,degraded,offline,paused,recent,
      queuePending,queueDead,queueDelivered,
      paymentsApproved,activeSubscriptions
    ]=await Promise.all([
      count("servers"),
      count("servers",q=>q.eq("current_status","up")),
      count("servers",q=>q.eq("current_status","degraded")),
      count("servers",q=>q.eq("current_status","down")),
      count("servers",q=>q.eq("monitoring_paused",true)),
      count("incidents",q=>q.gte("started_at",since)),
      count("telegram_outbox",q=>q.in("status",["pending","processing"])),
      count("telegram_outbox",q=>q.eq("status","dead").gte("created_at",since)),
      count("telegram_outbox",q=>q.eq("status","sent").gte("delivered_at",since)),
      count("payments",q=>q.eq("status","approved").gte("created_at",since)),
      count("subscriptions",q=>q.eq("status","active").gt("expires_at",new Date().toISOString())),
    ]);
    metrics={
      streammonitor_servers_total:servers,
      streammonitor_servers_online:online,
      streammonitor_servers_degraded:degraded,
      streammonitor_servers_offline:offline,
      streammonitor_servers_paused:paused,
      streammonitor_incidents_24h:recent,
      streammonitor_telegram_queue_pending:queuePending,
      streammonitor_telegram_failures_24h:queueDead,
      streammonitor_telegram_delivered_24h:queueDelivered,
      streammonitor_payments_approved_24h:paymentsApproved,
      streammonitor_subscriptions_active:activeSubscriptions,
    };
  }catch{
    await updateStatus("db_query_failed");
    return {enabled:true,status:"failed",metrics:0,code:"db_query_failed"};
  }
  const timeUnixNano=String(BigInt(Date.now())*1000000n);
  const payload={
    resourceMetrics:[{
      resource:{attributes:[
        {key:"service.name",value:{stringValue:"streammonitor"}},
        {key:"deployment.environment",value:{stringValue:"production"}},
      ]},
      scopeMetrics:[{
        scope:{name:"streammonitor.internal.observability",version:"1.0.0"},
        metrics:Object.entries(metrics).map(([name,value])=>({
          name,description:"Aggregate Stream Monitor platform metric",
          unit:"1",gauge:{dataPoints:[{timeUnixNano,asInt:String(value)}]},
        })),
      }],
    }],
  };
  try{
    const response=await fetch(`${endpoint}/v1/metrics`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Basic ${btoa(`${stackId}:${token}`)}`,
        "Accept":"application/json",
      },
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(12_000),
    });
    if(!response.ok){
      const code=`http_${response.status}`;
      await updateStatus(code);
      return {enabled:true,status:"failed",metrics:Object.keys(metrics).length,code};
    }
    await updateStatus("sent");
    return {enabled:true,status:"sent",metrics:Object.keys(metrics).length};
  }catch{
    await updateStatus("network_error");
    return {enabled:true,status:"failed",metrics:Object.keys(metrics).length,code:"network_error"};
  }
}
