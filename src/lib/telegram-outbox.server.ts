import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isPermanentTelegramError, nextBackoffSeconds, outboxKey } from "./telegram-outbox";

export class TelegramSendError extends Error {
  constructor(public status:number,public retryAfter:number|null,message:string){super(message);}
}
function resolveTarget(target:string){
  let token=process.env.TELEGRAM_BOT_TOKEN??"";
  let chat=target.trim();
  if(chat.includes(":")){const [specific,chatId]=chat.split(":");token=specific;chat=chatId;}
  return {token,chat};
}
export async function rawTelegramSend(target:string,text:string){
  const {token,chat}=resolveTarget(target);
  if(!token||!chat)throw new TelegramSendError(400,null,"telegram_configuration_missing");
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({chat_id:chat,text,parse_mode:"HTML",disable_web_page_preview:true}),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){
    const info=await response.json().catch(()=>null);
    throw new TelegramSendError(response.status,
      Number.isFinite(Number(info?.parameters?.retry_after))?Number(info.parameters.retry_after):null,
      `telegram_http_${response.status}`);
  }
}
export type TelegramRetryMeta={
  idempotencyKey?:string; serverId?:string; incidentId?:string;
  channelId?:string; alertEvent?:string;
};
/** Idempotent per incident, event and recipient. Never treats queued as delivered. */
export async function enqueueTelegramRetry(
  target:string,text:string,err:unknown,source="alert",meta:TelegramRetryMeta={}
){
  const status=err instanceof TelegramSendError?err.status:0;
  const retryAfter=err instanceof TelegramSendError?err.retryAfter:null;
  const key=meta.idempotencyKey || await outboxKey(target,text);
  const dead=isPermanentTelegramError(status);
  const {error}=await supabaseAdmin.from("telegram_outbox" as any).upsert({
    idempotency_key:key.slice(0,200),target,text,source:source.slice(0,60),
    status:dead?"dead":"pending",attempts:1,max_attempts:7,
    last_error:status?`telegram_http_${status}`:"telegram_transport_error",
    next_attempt_at:new Date(Date.now()+nextBackoffSeconds(1,retryAfter)*1000).toISOString(),
    server_id:meta.serverId??null,incident_id:meta.incidentId??null,
    channel_id:meta.channelId??null,alert_event:meta.alertEvent??null
  },{onConflict:"idempotency_key",ignoreDuplicates:true});
  if(error)throw new Error("telegram_retry_queue_write_failed");
  return {queued:!dead};
}
type OutboxItem={
  id:string;target:string;text:string;attempts:number;max_attempts:number;
  server_id:string|null;incident_id:string|null;channel_id:string|null;alert_event:string|null;
};
/** Atomic claim avoids concurrent workers processing the same pending item. */
export async function processTelegramOutbox(limit=12){
  const {data,error}=await (supabaseAdmin as any).rpc("claim_telegram_outbox",{_limit:Math.max(1,Math.min(limit,20))});
  if(error)throw new Error("telegram_queue_claim_failed");
  const messages=(data??[]) as OutboxItem[];
  let sent=0,failed=0,dead=0;
  for(const item of messages){
    try{
      await rawTelegramSend(item.target,item.text);
      const {error:saveError}=await supabaseAdmin.from("telegram_outbox" as any).update({
        status:"sent",delivered_at:new Date().toISOString(),last_error:null,
        updated_at:new Date().toISOString()
      }).eq("id",item.id);
      if(saveError)throw new Error("telegram_queue_state_write_failed");
      if(item.server_id && item.alert_event){
        await supabaseAdmin.from("notifications_log").insert({
          server_id:item.server_id,incident_id:item.incident_id??null,
          channel_id:item.channel_id??null,event:item.alert_event,
          ok:true,response:"telegram_retry_delivered"
        });
      }
      if(item.incident_id && item.alert_event?.includes("offline")){
        await supabaseAdmin.from("incidents").update({alert_sent:true}).eq("id",item.incident_id);
      }
      sent++;
    }catch(err){
      const status=err instanceof TelegramSendError?err.status:0;
      const retries=item.attempts;
      const isDead=isPermanentTelegramError(status)||retries>=Math.max(1,item.max_attempts||7);
      const delay=nextBackoffSeconds(retries,err instanceof TelegramSendError?err.retryAfter:null);
      await supabaseAdmin.from("telegram_outbox" as any).update({
        status:isDead?"dead":"pending",
        last_error:status?`telegram_http_${status}`:"telegram_transport_error",
        next_attempt_at:new Date(Date.now()+delay*1000).toISOString(),
        updated_at:new Date().toISOString()
      }).eq("id",item.id);
      if(isDead)dead++;else failed++;
    }
    // Prevent a burst if many alerts share the same Telegram bot.
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  return {picked:messages.length,sent,failed,dead};
}
