import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

/** A true native admin overview. Historical vendor dashboards do not backfill
 * this table; consented local events begin when first-party collection ships.
 * All data is from Stream Monitor's own database, never invented PostHog/Grafana numbers.
 */
export type PlatformDay={
 day:string;pageviews:number;visitors:number;signupStarted:number;
 signupEvents:number;featureOpens:number;registrations:number;
 paidOrders:number;revenueCents:number;
};
export type PlatformHealth={
 time:string;online:number;degraded:number;offline:number;
 paused:number;latency:number|null;telegramPending:number;incidentsOpen:number;
};
export type PlatformLive={
 at:string;total:number;online:number;degraded:number;offline:number;
 paused:number;dnsUnresolved:number;latency:number|null;
 incidentsOpen:number;telegramPending:number;telegramFailures24h:number;
 activeSubscriptions:number;
};
export type UnifiedReport={
 days:number;daily:PlatformDay[];
 features:{screen:string;opens:number}[];
 health:PlatformHealth[];
 trackingStarted:string|null;
 live:PlatformLive;
 integrations:{
   posthogEnabled:boolean;grafanaEnabled:boolean;
   grafanaLastExportAt:string|null;grafanaLastExportStatus:string;
 };
};

export const getUnifiedObservability=createServerFn({method:"GET"})
.middleware([requireSupabaseAuth])
.inputValidator((input:{days?:number})=>z.object({days:z.union([z.literal(7),z.literal(14),z.literal(30)]).default(14)}).parse(input))
.handler(async ({context,data}):Promise<UnifiedReport>=>{
  const {data:isAdmin,error:roleError}=await context.supabase
    .rpc("has_role",{_user_id:context.userId,_role:"admin"});
  if(roleError||isAdmin!==true)throw new Error("Acesso restrito à administração.");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  // Live values are from authoritative platform tables. Sampling into the
  // current 15m bucket lets the native dashboard work before Grafana is linked.
  const {data:live,error:liveError}=await db.rpc("streammonitor_capture_health_snapshot");
  if(liveError||!live)throw new Error("Não foi possível consultar a saúde da plataforma.");
  const [report,history,config]=await Promise.all([
    db.rpc("streammonitor_observability_report",{p_days:data.days}),
    db.rpc("streammonitor_health_series",{p_days:data.days}),
    db.from("observability_integrations")
      .select("posthog_enabled,grafana_enabled,grafana_last_export_at,grafana_last_export_status")
      .eq("id",1).single(),
  ]);
  if(report.error||history.error||config.error||!report.data||!config.data)
    throw new Error("Não foi possível carregar os gráficos administrativos.");
  const base=report.data as Pick<UnifiedReport,"days"|"daily"|"features"|"trackingStarted">;
  return {
    ...base,
    daily:Array.isArray(base.daily)?base.daily:[],
    features:Array.isArray(base.features)?base.features:[],
    health:Array.isArray(history.data)?history.data as PlatformHealth[]:[],
    live:live as PlatformLive,
    integrations:{
      posthogEnabled:config.data.posthog_enabled===true,
      grafanaEnabled:config.data.grafana_enabled===true,
      grafanaLastExportAt:config.data.grafana_last_export_at??null,
      grafanaLastExportStatus:config.data.grafana_last_export_status??"not_configured",
    },
  };
});
