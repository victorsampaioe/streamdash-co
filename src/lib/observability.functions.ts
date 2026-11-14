import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const posthogSchema=z.object({
  projectKey:z.string().max(180),
  host:z.enum(["https://us.i.posthog.com","https://eu.i.posthog.com"]),
  enabled:z.boolean(),
});
const grafanaSchema=z.object({
  endpoint:z.string().max(255),
  stackId:z.string().max(32),
  token:z.string().max(2048).optional(),
  enabled:z.boolean(),
});

async function requireAdmin(context:any) {
  const {data,error}=await context.supabase.rpc("has_role",{_user_id:context.userId,_role:"admin"});
  if(error||data!==true)throw new Error("Acesso restrito à administração.");
}
async function db() {
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function existingConfig() {
  const d=await db();
  const {data,error}=await d.from("observability_integrations").select("*").eq("id",1).single();
  if(error||!data)throw new Error("Configuração de observabilidade indisponível.");
  return data;
}
export const getPublicPosthogConfig=createServerFn({method:"GET"}).handler(async ()=>{
  const cfg=await existingConfig();
  if(!cfg.posthog_enabled || !/^phc_[A-Za-z0-9_-]{12,150}$/.test(cfg.posthog_project_key)) {
    return {enabled:false,projectKey:"",host:"https://us.i.posthog.com" as const};
  }
  return {enabled:true,projectKey:cfg.posthog_project_key,host:cfg.posthog_host as string};
});

export const getObservabilityAdmin=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.handler(async ({context})=>{
  await requireAdmin(context);
  const d=await db();
  const [cfg,result]=await Promise.all([
    existingConfig(),
    d.rpc("streammonitor_grafana_token_service"),
  ]);
  if(result.error)throw new Error("Não foi possível consultar o cofre do Grafana.");
  return {
    posthog:{projectKey:cfg.posthog_project_key??"",host:cfg.posthog_host,
      enabled:cfg.posthog_enabled===true},
    grafana:{endpoint:cfg.grafana_endpoint??"",stackId:cfg.grafana_stack_id??"",
      enabled:cfg.grafana_enabled===true,hasToken:typeof result.data==="string"&&result.data.length>0,
      lastExportAt:cfg.grafana_last_export_at??null,lastExportStatus:cfg.grafana_last_export_status??"not_configured"},
  };
});

export const savePosthogSettings=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((raw:z.input<typeof posthogSchema>)=>posthogSchema.parse(raw))
.handler(async ({context,data})=>{
  await requireAdmin(context);
  const key=data.projectKey.trim();
  if(data.enabled && !/^phc_[A-Za-z0-9_-]{12,150}$/.test(key))
    throw new Error("Informe o Project API Key (phc_...) do seu projeto PostHog.");
  if(key && !/^phc_[A-Za-z0-9_-]{12,150}$/.test(key))
    throw new Error("Project API Key inválida.");
  const d=await db();
  const {error}=await d.from("observability_integrations")
    .update({posthog_project_key:key,posthog_host:data.host,
      posthog_enabled:data.enabled,updated_at:new Date().toISOString()})
    .eq("id",1);
  if(error)throw new Error("Não foi possível salvar as configurações do PostHog.");
  return {saved:true,enabled:data.enabled};
});

export const saveGrafanaSettings=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth])
.inputValidator((raw:z.input<typeof grafanaSchema>)=>grafanaSchema.parse(raw))
.handler(async ({context,data})=>{
  await requireAdmin(context);
  const endpoint=data.endpoint.trim().replace(/\/$/,"");
  const stackId=data.stackId.trim();
  if(endpoint) {
    let url:URL;
    try {url=new URL(endpoint)}catch{throw new Error("Endpoint Grafana inválido.");}
    if(url.protocol!=="https:"||!/^otlp-[a-z0-9-]+\.grafana\.net$/i.test(url.hostname)
      ||url.pathname!=="/otlp"||url.username||url.password||url.search||url.hash) {
      throw new Error("Use somente o endpoint oficial HTTPS do Grafana Cloud, terminado em /otlp.");
    }
  }
  if(stackId && !/^\d{3,18}$/.test(stackId))
    throw new Error("Informe o Instance ID numérico da sua stack Grafana Cloud.");
  const d=await db();
  const token=data.token?.trim()||"";
  if(token) {
    if(token.length<16||token.length>2048||/\s/.test(token))
      throw new Error("Token inválido. Utilize um token Grafana com permissão de escrita de métricas.");
    const {error}=await d.rpc("streammonitor_store_grafana_token_service",{p_token:token});
    if(error)throw new Error("Não foi possível guardar o token no cofre.");
  }
  const {data:stored,error:readError}=await d.rpc("streammonitor_grafana_token_service");
  if(readError)throw new Error("Cofre de segredos indisponível.");
  if(data.enabled && (!endpoint || !stackId || !stored))
    throw new Error("Para ativar, informe endpoint, Instance ID e token do Grafana Cloud.");
  const {error}=await d.from("observability_integrations").update({
    grafana_endpoint:endpoint,grafana_stack_id:stackId,
    grafana_enabled:data.enabled,updated_at:new Date().toISOString()
  }).eq("id",1);
  if(error)throw new Error("Não foi possível salvar as configurações do Grafana.");
  return {saved:true,enabled:data.enabled,hasToken:!!stored};
});

export const runGrafanaMetricsNow=createServerFn({method:"POST"})
.middleware([requireSupabaseAuth]).handler(async ({context})=>{
  await requireAdmin(context);
  const {exportGrafanaMetrics}=await import("./grafana-metrics.server");
  return exportGrafanaMetrics();
});
