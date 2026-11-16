import {createFileRoute} from "@tanstack/react-router";

/** Authenticated Cloudflare Queue bridge; accepts only a fixed action and
 * timestamp. Never accepts Telegram text, recipients, tokens, or raw SQL.
 * The platform's existing incident state and channel-level idempotency are
 * always authoritative. No raw Telegram destination leaves PostgreSQL.
 */
export const Route=createFileRoute("/api/public/edge-telegram/dispatch")({
  server:{handlers:{POST:async({request})=>{
    const raw=await request.text();
    if(raw.length>1600)return Response.json({ok:false,error:"too_large"},{status:413});
    const {verifyRegionSignature}=await import("@/lib/region-auth.server");
    const {verifyCloudflareEdgeSignature}=await import("@/lib/region-cloudflare-auth.server");
    const permitted=verifyRegionSignature(raw,request.headers.get("x-signature"))
      ||await verifyCloudflareEdgeSignature(raw,request.headers.get("x-cf-signature"));
    if(!permitted)return Response.json({ok:false,error:"unauthorized"},{status:401});
    let payload:{action?:string;ts?:number;id?:string};
    try{payload=JSON.parse(raw);}
    catch{return Response.json({ok:false,error:"bad_json"},{status:400});}
    const time=Number(payload.ts);
    if(!Number.isFinite(time)||Math.abs(Date.now()-time)>5*60_000||
       !/^[a-f0-9-]{36}$/i.test(String(payload.id||"")))
      return Response.json({ok:false,error:"expired_or_invalid"},{status:400});
    if(payload.action==="health")
      return Response.json({ok:true,service:"telegram-dispatch-bridge",mode:"health",
        message_delivery:false,queue_compatible:true},
        {headers:{"cache-control":"no-store"}});
    if(payload.action!=="run")return Response.json({ok:false,error:"invalid_action"},{status:400});

    const {runTelegramDeliveryCycle}=await import("@/lib/telegram-delivery-cycle.server");
    try{
      const result=await runTelegramDeliveryCycle();
      if("skipped" in result&&result.skipped)
        return Response.json({ok:true,skipped:true,reason:"lock_held"},{
          headers:{"cache-control":"no-store"}});
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const completed_at=new Date().toISOString();
      const {error}=await supabaseAdmin.from("app_settings").upsert({
        key:"cf_telegram_delivery_heartbeat",
        value:{completed_at,provider:"cloudflare-queues",
          picked:result.outbox.picked,delivered:result.outbox.sent,
          delivery_errors:result.deliveryErrors},
        updated_at:completed_at
      },{onConflict:"key"});
      if(error)return Response.json({ok:false,error:"heartbeat_write_failed"},{status:503});
      return Response.json({ok:true,provider:"cloudflare-queues",
        completed_at,deliveryErrors:result.deliveryErrors,
        attempted:{
          dns_offline:result.offline.attempted,
          dns_recovered:result.online.attempted,
          server:result.service.attempted,
          outbox:result.outbox.picked
        },
        delivered:result.outbox.sent,
        dead:result.outbox.dead},{headers:{"cache-control":"no-store"}});
    }catch(e){
      console.error("[edge-telegram] dispatch_failed",e instanceof Error?e.name:"unknown");
      return Response.json({ok:false,error:"dispatch_failed"},{status:503});
    }
  }}}
});
