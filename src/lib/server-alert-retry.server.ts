import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Recover failed or missing customer Telegram deliveries for confirmed HTTP/IPTV
 * outage and recovery incidents. Per-channel dedupe is handled by
 * processTelegramAlert, using the existing notifications_log table.
 */
export async function retryServerIncidentAlerts(limit = 4) {
  const cutoff = new Date(Date.now()-24*60*60_000).toISOString();
  const [opened,closed] = await Promise.all([
    supabaseAdmin.from("incidents")
      .select("id,server_id,started_at,ended_at,reason")
      .eq("incident_type","server").is("ended_at",null)
      .order("last_check_at",{ascending:false}).limit(100),
    supabaseAdmin.from("incidents")
      .select("id,server_id,started_at,ended_at,reason")
      .eq("incident_type","server").not("ended_at","is",null)
      .gte("ended_at",cutoff).order("ended_at",{ascending:false}).limit(100),
  ]);
  if(opened.error||closed.error)
    throw new Error("Cannot fetch confirmed service incidents");
  const incidents=[...(opened.data??[]),...(closed.data??[])];
  if(!incidents.length)return {found:0,attempted:0,failed:0,skipped:0};
  const ids=[...new Set(incidents.map(i=>i.server_id))];
  const {data:servers,error:serverError}=await supabaseAdmin.from("servers")
    .select("id,owner_id,current_status,dns_enabled,dns_status,last_checked_at,monitoring_paused")
    .in("id",ids);
  if(serverError)throw new Error("Cannot check current monitored service state");
  const byId=new Map((servers??[]).map(s=>[s.id,s]));

  const {getActiveOwnerIds}=await import("./service-status.server");
  const activeOwners=await getActiveOwnerIds((servers??[]).map(s=>s.owner_id));
  const {data:channels,error:channelsError}=await supabaseAdmin.from("alert_channels")
    .select("id,owner_id").eq("kind","telegram").eq("enabled",true)
    .in("owner_id",[...new Set((servers??[]).map(s=>s.owner_id))]);
  if(channelsError)throw new Error("Cannot check Telegram channel configuration");
  const channelsByOwner=new Map<string,string[]>();
  for(const ch of channels??[]){
    channelsByOwner.set(ch.owner_id,[...(channelsByOwner.get(ch.owner_id)??[]),ch.id]);
  }

  const incidentIds=incidents.map(i=>i.id);
  const {data:history,error:historyError}=await supabaseAdmin.from("notifications_log")
    .select("incident_id,channel_id,event,ok,sent_at")
    .in("incident_id",incidentIds)
    .in("event",["tg_server_offline","tg_server_online"])
    .order("sent_at",{ascending:false}).limit(2000);
  if(historyError)throw new Error("Cannot consult Telegram incident delivery log");
  const successful=new Set<string>(),lastAttempt=new Map<string,number>();
  for(const row of history??[]){
    if(!row.incident_id)continue;
    const kind=`${row.incident_id}|${row.event}`;
    if(!lastAttempt.has(kind))lastAttempt.set(kind,new Date(row.sent_at).getTime());
    if(row.ok)successful.add(`${kind}|${row.channel_id??"admin"}`);
  }
  const adminConfigured=!!process.env.TELEGRAM_BOT_TOKEN&&!!process.env.ADMIN_TELEGRAM_CHAT_ID;
  const now=Date.now();
  const pending=incidents.filter(i=>{
    const srv=byId.get(i.server_id);
    if(!srv||srv.monitoring_paused||!activeOwners.has(srv.owner_id))return false;
    const checked=srv.last_checked_at?new Date(srv.last_checked_at).getTime():0;
    if(now-checked>15*60_000)return false;
    const recovering=!!i.ended_at;
    const event=recovering?"tg_server_online":"tg_server_offline";
    if(recovering){
      // Status do SERVIÇO e do DNS são independentes. Se o serviço já
      // foi confirmado como UP, um DNS atrasado não deve bloquear
      // indefinidamente o aviso de recuperação do IPTV.
      if(srv.current_status!=="up")return false;
    }else if(srv.current_status!=="down")return false;
    const incidentAt=new Date((recovering?i.ended_at:i.started_at)!).getTime();
    const last=lastAttempt.get(`${i.id}|${event}`)??incidentAt;
    if(now-last<5*60_000)return false;
    const channels=channelsByOwner.get(srv.owner_id)??[];
    const awaitingCustomer=channels.some(ch=>!successful.has(`${i.id}|${event}|${ch}`));
    const awaitingAdmin=adminConfigured&&!successful.has(`${i.id}|${event}|admin`);
    return awaitingCustomer||awaitingAdmin;
  }).sort((a,b)=>
    new Date(a.ended_at??a.started_at).getTime()-new Date(b.ended_at??b.started_at).getTime()
  );
  const {processTelegramAlert}=await import("./telegram-alerts.server");
  let attempted=0,failed=0;
  for(const i of pending.slice(0,Math.max(1,Math.min(6,limit)))){
    attempted++;
    const recovering=!!i.ended_at;
    const secs=Math.max(0,Math.floor(
      (new Date(i.ended_at??new Date().toISOString()).getTime()-new Date(i.started_at).getTime())/1000
    ));
    const downtime=secs<60?`${secs}s`:secs<3600?`${Math.round(secs/60)}min`:`${(secs/3600).toFixed(1)}h`;
    try{
      await processTelegramAlert({
        serverId:i.server_id,incidentId:i.id,kind:"server",
        event:recovering?"ONLINE":"OFFLINE",
        reason:i.reason??"Falha de disponibilidade confirmada.",
        timeOffline:recovering?downtime:undefined,
      });
    }catch(e){
      failed++;
      console.error("[server-alert-retry] Delivery failed",i.server_id,e instanceof Error?e.name:"unknown");
    }
  }
  return {found:incidents.length,attempted,failed,skipped:incidents.length-pending.length};
}
