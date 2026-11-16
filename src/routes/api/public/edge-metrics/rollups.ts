import {createFileRoute} from "@tanstack/react-router";

/** Cloudflare-only authenticated aggregate feed.
 * No user, host, IP, chat, payment, or secret data is returned.
 */
export const Route=createFileRoute("/api/public/edge-metrics/rollups")({
  server:{handlers:{GET:async({request})=>{
    const {verifyRegionSignature}=await import("@/lib/region-auth.server");
    const {verifyCloudflareEdgeSignature}=await import("@/lib/region-cloudflare-auth.server");
    const message="metrics-rollups-v1";
    const allowed=verifyRegionSignature(message,request.headers.get("x-signature"))
      ||await verifyCloudflareEdgeSignature(message,request.headers.get("x-cf-signature"));
    if(!allowed)return Response.json({ok:false,error:"unauthorized"},{status:401});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const cutoff=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
    const {data,error}=await supabaseAdmin.from("checks_daily")
      .select("server_id,day,total,ups,downs,degraded,avg_latency_ms")
      .gte("day",cutoff).order("day",{ascending:true}).limit(5000);
    if(error||!data||data.length===5000)
      return Response.json({ok:false,error:"rollup_read_unavailable"},{status:503});
    const days=new Map<string,{
      ids:Set<string>;checks:number;ups:number;downs:number;degraded:number;
      latencyTotal:number;latencyWeight:number
    }>();
    for(const item of data){
      const day=String(item.day);
      let x=days.get(day);
      if(!x){x={ids:new Set(),checks:0,ups:0,downs:0,degraded:0,latencyTotal:0,latencyWeight:0};days.set(day,x);}
      x.ids.add(item.server_id);
      const total=Math.max(0,Number(item.total||0));
      x.checks+=total;
      x.ups+=Math.max(0,Number(item.ups||0));
      x.downs+=Math.max(0,Number(item.downs||0));
      x.degraded+=Math.max(0,Number(item.degraded||0));
      if(item.avg_latency_ms!=null&&Number.isFinite(Number(item.avg_latency_ms))){
        x.latencyTotal+=Number(item.avg_latency_ms)*total;
        x.latencyWeight+=total;
      }
    }
    const rollups=[...days.entries()].map(([day,x])=>({
      day,servers:x.ids.size,checks:x.checks,ups:x.ups,
      downs:x.downs,degraded:x.degraded,
      avg_latency_ms:x.latencyWeight?Math.round(x.latencyTotal/x.latencyWeight):null,
      uptime_pct:x.checks?Math.round(x.ups/x.checks*10000)/100:null,
    })).sort((a,b)=>a.day.localeCompare(b.day));
    return Response.json({ok:true,rollups,count:rollups.length},
      {headers:{"cache-control":"no-store"}});
  }}}
});
