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
