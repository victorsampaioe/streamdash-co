import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily subscription/credit renewal notifications for the linked private
 * Telegram chats. Uses existing Telegram Delivery Guard queue and locks.
 */
export const Route=createFileRoute("/api/public/cron/billing")({
  server:{
    handlers:{
      POST:async ({request})=>{
        const secret=process.env.CRON_SECRET;
        if(!secret||request.headers.get("x-cron-secret")!==secret){
          return Response.json({ok:false,error:"unauthorized"},{status:401});
        }
        if(process.env.IS_CORE==="true"){
          return Response.json({ok:true,skipped:true,reason:"panel_only"});
        }
        // Internal, secret-protected, read-only diagnostic used to validate
        // the production checkout wiring WITHOUT creating a Pix charge.
        if(new URL(request.url).searchParams.get("health")==="1"){
          const {getMpToken}=await import("@/lib/mercadopago.server");
          return Response.json({
            ok:true,
            checkoutConfigured:Boolean(getMpToken()),
            telegramConfigured:Boolean(process.env.TELEGRAM_BOT_TOKEN),
            callbackConfigured:Boolean(process.env.SITE_URL||"https://streammonitor.site"),
          },{headers:{"Cache-Control":"no-store"}});
        }
        if(new URL(request.url).searchParams.get("health")==="telegram"){
          const token=process.env.TELEGRAM_BOT_TOKEN;
          if(!token) return Response.json({ok:false,error:"bot_not_configured"},{status:503});
          try{
            const answer=await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`,{
              signal:AbortSignal.timeout(9000),
              headers:{"Accept":"application/json"},
            });
            const json=await answer.json();
            const info=json?.result??{};
            const registered=typeof info.url==="string" && info.url.length>0;
            const allowed=Array.isArray(info.allowed_updates)?info.allowed_updates:[];
            return Response.json({
              ok:answer.ok && json.ok===true,
              webhookRegistered:registered,
              webhookPathValid:registered && new URL(info.url).pathname==="/api/public/telegram/webhook",
              callbackAllowed:allowed.length===0 || allowed.includes("callback_query"),
              allowedUpdates:allowed,
              pendingUpdateCount:Number(info.pending_update_count??0),
              lastErrorDate:info.last_error_date?new Date(info.last_error_date*1000).toISOString():null,
              lastErrorType:info.last_error_message?/unauthorized|forbidden|timeout|not found|bad gateway|internal server error/i.exec(info.last_error_message)?.[0]??"telegram_webhook_error":null,
            },{headers:{"Cache-Control":"no-store"}});
          }catch(err){
            console.error("[telegram-webhook-health] info unavailable",err instanceof Error?err.name:"unknown");
            return Response.json({ok:false,error:"telegram_info_unavailable"},{status:503});
          }
        }
        try{
          const {withCycleLock}=await import("@/lib/job-lock.server");
          const {enqueueDailyTelegramBillingReminders}=await import("@/lib/telegram-billing.server");
          const result=await withCycleLock("cron-billing-notices",180,()=>enqueueDailyTelegramBillingReminders());
          if("skipped" in result)return Response.json({ok:true,...result});
          // The standard monitor cron also drains this durable outbox. Run a
          // small batch here so initial delivery does not depend on its health.
          let delivery:unknown=null;
          try{
            const {processTelegramOutbox}=await import("@/lib/telegram-outbox.server");
            delivery=await withCycleLock("telegram-outbox",60,()=>processTelegramOutbox(10));
          }catch(err){
            console.error("[billing-cron] delivery deferred",err instanceof Error?err.name:"unknown");
          }
          return Response.json({ok:true,...result,delivery},{headers:{"Cache-Control":"no-store"}});
        }catch(err){
          console.error("[billing-cron] failed",err instanceof Error?err.name:"unknown");
          return Response.json({ok:false,error:"billing_cycle_failed"},{status:503});
        }
      },
    },
  },
});
