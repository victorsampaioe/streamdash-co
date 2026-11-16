import {createFileRoute} from "@tanstack/react-router";

/** Legacy pg_cron becomes standby once the signed Cloudflare Queue worker
 * has demonstrated successful scheduled dispatch recently.
 * Heartbeat belongs to the last completed application cycle, never an enqueue.
 */
async function cloudflareTelegramHealthy(){
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data,error}=await supabaseAdmin.from("app_settings")
    .select("value").eq("key","cf_telegram_delivery_heartbeat").maybeSingle();
  if(error||!data?.value)return false;
  const stamp=Date.parse((data.value as {completed_at?:string}).completed_at||"");
  return Number.isFinite(stamp)&&stamp<=Date.now()&&Date.now()-stamp<180_000;
}
async function run(request:Request){
  const configured=process.env.CRON_SECRET;
  if(!configured||request.headers.get("authorization")!==`Bearer ${configured}`)
    return Response.json({ok:false,error:"unauthorized"},{status:401});
  try{
    if(await cloudflareTelegramHealthy())
      return Response.json({ok:true,skipped:true,provider:"cloudflare-queue",legacy:"standby"},
        {headers:{"cache-control":"no-store"}});
    const {runTelegramDeliveryCycle}=await import("@/lib/telegram-delivery-cycle.server");
    const result=await runTelegramDeliveryCycle();
    return Response.json({ok:true,provider:"legacy-fallback",...result},
      {headers:{"cache-control":"no-store"}});
  }catch(e){
    console.error("[telegram-legacy-fallback] delivery failed",e instanceof Error?e.name:"error");
    return Response.json({ok:false,error:"telegram_legacy_delivery_failed"},{status:503});
  }
}
export const Route=createFileRoute("/api/public/cron/dns-alerts")({
  server:{handlers:{POST:async({request})=>run(request)}}
});
