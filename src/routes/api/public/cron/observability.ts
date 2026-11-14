import {createFileRoute} from "@tanstack/react-router";

/** Low-cardinality Grafana Cloud OTLP export. Runs every 15 minutes.
 * Secret-authenticated. Does not call Grafana until admin enables it.
 */
export const Route=createFileRoute("/api/public/cron/observability")({
  server:{handlers:{
    POST:async({request})=>{
      const secret=process.env.CRON_SECRET;
      if(!secret||request.headers.get("x-cron-secret")!==secret)
        return Response.json({ok:false,error:"unauthorized"},{status:401});
      if(process.env.IS_CORE==="true")
        return Response.json({ok:true,skipped:true,reason:"worker_only"});
      try{
        const {withCycleLock}=await import("@/lib/job-lock.server");
        const {exportGrafanaMetrics}=await import("@/lib/grafana-metrics.server");
        const result=await withCycleLock("grafana-observability-quarterhour",180,()=>exportGrafanaMetrics());
        return Response.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
      }catch(err){
        console.error("[grafana] export cycle failed",err instanceof Error?err.name:"unknown");
        return Response.json({ok:false,error:"grafana_cycle_failed"},{status:503});
      }
    },
  }},
});
