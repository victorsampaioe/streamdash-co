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
        const result=await withCycleLock("grafana-observability-quarterhour",180,async()=>{
          // Native observability continues working even without Grafana access.
          const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
          const {data:snapshot,error:snapshotError}=await (supabaseAdmin as any)
            .rpc("streammonitor_capture_health_snapshot");
          if(snapshotError)throw new Error("platform_health_snapshot_failed");
          const {exportGrafanaMetrics}=await import("@/lib/grafana-metrics.server");
          let grafana;
          try{grafana=await exportGrafanaMetrics();}
          catch{grafana={status:"failed",code:"grafana_export_error"};}
          return {snapshotAt:snapshot?.at??null,grafana};
        });
        return Response.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
      }catch(err){
        console.error("[grafana] export cycle failed",err instanceof Error?err.name:"unknown");
        return Response.json({ok:false,error:"grafana_cycle_failed"},{status:503});
      }
    },
  }},
});
