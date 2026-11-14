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
        // One-time, authenticated repair: Telegram may register only
        // "message" updates, which makes inline PIX buttons inert.
        // Preserve the existing webhook URL and update types. Never drop updates.
        if(new URL(request.url).searchParams.get("action")==="enable_callbacks"){
          const token=process.env.TELEGRAM_BOT_TOKEN;
          if(!token)return Response.json({ok:false,error:"bot_not_configured"},{status:503});
          try{
            const {createHash}=await import("node:crypto");
            const res=await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`,{
              signal:AbortSignal.timeout(10000),
            });
            if(!res.ok)return Response.json({ok:false,error:"get_webhook_failed"},{status:502});
            const response=await res.json() as {ok:boolean;result?:{url?:string;allowed_updates?:string[];max_connections?:number}};
            const info=response.result;
            if(!response.ok||!info?.url)return Response.json({ok:false,error:"webhook_not_registered"},{status:409});
            const url=new URL(info.url);
            const allowedHosts=new Set([
              "streammonitor.site",
              "www.streammonitor.site",
              "streamdash-co.lovable.app",
              "project--53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd.lovable.app",
              "project--53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd-dev.lovable.app",
            ]);
            if(url.protocol!=="https:"||!allowedHosts.has(url.hostname)||url.pathname!=="/api/public/telegram/webhook"){
              return Response.json({ok:false,error:"unexpected_webhook_target"},{status:409});
            }
            // The legacy webhook points to an ephemeral Lovable -dev domain.
            // Migrate to the verified production URL, preserving allowed types.
            const targetUrl="https://streammonitor.site/api/public/telegram/webhook";
            const prior=Array.isArray(info.allowed_updates)?info.allowed_updates:[];
            const callbackAllowed=prior.length===0||prior.includes("callback_query");
            if(callbackAllowed && info.url===targetUrl){
              return Response.json({ok:true,changed:false,callbackAllowed:true,productionWebhook:true});
            }
            const next=prior.length===0?[]:[...new Set([...prior,"callback_query"])];
            const secretToken=createHash("sha256")
              .update(`telegram-webhook:${token}`).digest("base64url");
            const update=await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{
              method:"POST",
              headers:{"content-type":"application/json"},
              body:JSON.stringify({
                url:targetUrl,
                allowed_updates:next,
                secret_token:secretToken,
                drop_pending_updates:false,
                ...(info.max_connections?{max_connections:info.max_connections}:{}),
              }),
              signal:AbortSignal.timeout(11000),
            });
            const result=await update.json().catch(()=>({ok:false}));
            if(!update.ok||!result.ok){
              console.error("[telegram-webhook-setup] failed status",update.status);
              return Response.json({ok:false,error:"set_webhook_failed"},{status:502});
            }
            // Verify the update was accepted by Telegram, not just requested.
            const confirm=await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`,{
              signal:AbortSignal.timeout(9000),
            });
            const state=await confirm.json().catch(()=>({ok:false}));
            const current=state?.result??{};
            const types=Array.isArray(current.allowed_updates)?current.allowed_updates:[];
            const verified=confirm.ok && state.ok===true
              && current.url===targetUrl
              && (types.length===0||types.includes("callback_query"));
            return Response.json({
              ok:verified,changed:true,callbackAllowed:verified,
              productionWebhook:current.url===targetUrl,
              allowedUpdates:types,
            },{status:verified?200:502,headers:{"Cache-Control":"no-store"}});
          }catch(err){
            console.error("[telegram-webhook-setup] unavailable",err instanceof Error?err.name:"unknown");
            return Response.json({ok:false,error:"webhook_setup_unavailable"},{status:503});
          }
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
              webhookHost:registered?new URL(info.url).hostname:null,
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
