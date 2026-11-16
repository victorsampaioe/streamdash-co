import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";

const resolver=z.object({
  code:z.enum(["cloudflare","google","adguard"]),
  ok:z.boolean(),
  ips:z.array(z.string().max(45)).max(8),
  response_ms:z.number().int().nonnegative().max(30000).nullable(),
  ttl:z.number().int().nonnegative().max(604800).nullable(),
  error:z.string().max(140).nullable(),
});
const item=z.object({
  server_id:z.string().uuid(),
  host:z.string().max(300),
  checked_at:z.string().datetime({offset:true}),
  status:z.enum(["ok","degraded","down","unknown"]),
  resolvers:z.array(resolver).min(2).max(3),
});
const payload=z.object({checks:z.array(item).min(1).max(25)});

function ipv4(value:string):boolean{
  const pieces=value.split(".");
  return pieces.length===4&&pieces.every(n=>/^\d{1,3}$/.test(n)&&Number(n)>=0&&Number(n)<=255);
}

export const Route=createFileRoute("/api/public/edge-dns/report")({
  server:{handlers:{POST:async({request})=>{
    const size=Number(request.headers.get("content-length")||0);
    if(size>55000)return Response.json({error:"too_large"},{status:413});
    const {authorizeCloudflareDnsBridge,getCloudflareDnsPrimary}
      =await import("@/lib/cloudflare-dns-bridge.server");
    const raw=await request.text();
    const {verifyRegionSignature}=await import("@/lib/region-auth.server");
    const {verifyCloudflareEdgeSignature}=await import("@/lib/region-cloudflare-auth.server");
    // Body is read only once and the exact bytes are authenticated.
    const verified=await authorizeCloudflareDnsBridge(request)
      ||verifyRegionSignature(raw,request.headers.get("x-signature"))
      ||await verifyCloudflareEdgeSignature(raw,request.headers.get("x-cf-signature"));
    if(!verified)return Response.json({error:"unauthorized"},{status:401});
    if(raw.length>55000)return Response.json({error:"too_large"},{status:413});
    const parsed=payload.safeParse(JSON.parse(raw||"null"));
    if(!parsed.success)return Response.json({error:"invalid_report"},{status:400});

    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {getActiveOwnerIds}=await import("@/lib/service-status.server");
    const {normalizeHost,isCloudflareIp,runDnsCheck}=await import("@/lib/dns.server");
    const ids=[...new Set(parsed.data.checks.map(x=>x.server_id))];
    const {data:servers,error}=await supabaseAdmin.from("servers")
      .select("id,host,owner_id,dns_enabled,monitoring_paused").in("id",ids);
    if(error)return Response.json({error:"server_lookup_failed"},{status:503});
    const allowed=await getActiveOwnerIds((servers??[]).map(s=>s.owner_id));
    const byId=new Map((servers??[]).map(s=>[s.id,s]));
    const now=Date.now();
    const good=parsed.data.checks.filter(check=>{
      const srv=byId.get(check.server_id);
      const time=Date.parse(check.checked_at);
      return srv?.dns_enabled===true&&srv.monitoring_paused===false
        &&allowed.has(srv.owner_id)
        &&normalizeHost(srv.host)===normalizeHost(check.host)
        &&!!normalizeHost(check.host)
        &&Number.isFinite(time)&&Math.abs(now-time)<4*60_000;
    });
    if(!good.length)return Response.json({ok:true,accepted:0,skipped:parsed.data.checks.length});

    const rows=good.map(check=>{
      const validResolvers=check.resolvers.map(r=>({
        code:r.code,
        name:r.code==="cloudflare"?"Cloudflare 1.1.1.1":r.code==="google"?"Google 8.8.8.8":"AdGuard DNS",
        country:"Global",ok:r.ok,ips:r.ips.filter(ipv4),
        response_ms:r.response_ms,ttl:r.ttl,error:r.error,
      }));
      const successes=validResolvers.filter(r=>r.ok&&r.ips.length>0).length;
      const usable=validResolvers.filter(r=>r.error!=="transport_error").length;
      const status=usable<2?"unknown":check.status;
      const ips=[...new Set(validResolvers.flatMap(r=>r.ips))].slice(0,15);
      const times=validResolvers.map(r=>r.response_ms).filter((v):v is number=>v!==null);
      const average=times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null;
      const ttls=validResolvers.map(r=>r.ttl).filter((v):v is number=>v!==null);
      const ttl=ttls.length?Math.min(...ttls):null;
      return {check,resolvers:validResolvers,successes,ips,status,average,ttl};
    });

    const {data:saved,error:saveError}=await supabaseAdmin.from("cloudflare_dns_probes" as any)
      .upsert(rows.map(r=>({
        server_id:r.check.server_id,checked_at:r.check.checked_at,
        probe_status:r.status,resolved_ok:r.successes,
        resolver_count:r.resolvers.length,avg_response_ms:r.average,
        details:{resolvers:r.resolvers,ipv4:r.ips,ttl:r.ttl,source:"cloudflare-workers"}
      })),{onConflict:"server_id,checked_at",ignoreDuplicates:true})
      .select("server_id,checked_at");
    if(saveError)return Response.json({error:"probe_store_failed"},{status:503});

    const primary=await getCloudflareDnsPrimary();
    const savedKeys=new Set((saved??[]).map(r=>r.server_id+"|"+r.checked_at));
    let applied=0,failed=0;
    if(primary){
      // Read-only/unknown probes must not rewrite confirmed customer status.
      const pending=rows.filter(r=>r.status!=="unknown"&&savedKeys.has(r.check.server_id+"|"+r.check.checked_at));
      const {runPool}=await import("@/lib/pool");
      const outcome=await runPool(pending,async r=>{
        const clean=r.resolvers.filter(x=>x.ok||x.error!=="transport_error");
        if(clean.length<2)return;
        const successes=clean.filter(x=>x.ok&&x.ips.length>0).length;
        const {error:checkError}=await supabaseAdmin.from("servers").select("id")
          .eq("id",r.check.server_id).eq("dns_enabled",true).eq("monitoring_paused",false).maybeSingle();
        if(checkError)throw checkError;
        await runDnsCheck(r.check.server_id,{quick:true,edgeReport:{
          host:normalizeHost(r.check.host)!, checked_at:r.check.checked_at,
          resolvers:clean,resolved_ok:successes,resolver_count:clean.length,
          consistent:successes===clean.length,
          avg_response_ms:r.average,min_response_ms:r.resolvers.reduce<number|null>((m,x)=>x.response_ms===null?m:m===null?x.response_ms:Math.min(m,x.response_ms),null),
          max_response_ms:r.resolvers.reduce<number|null>((m,x)=>x.response_ms===null?m:m===null?x.response_ms:Math.max(m,x.response_ms),null),
          propagation_pct:Math.round(100*successes/clean.length),propagation:[],
          records:{A:r.ips},primary_ip:r.ips[0]??null,ipv4:r.ips,
          ipv6:[],nameservers:[],ttl_seconds:r.ttl,dnssec:null,
          cloudflare_proxy:r.ips.some(isCloudflareIp),
          asn:null,org:null,country:null,city:null,datacenter:null,
          domain_expires_at:null,registrar:null,
          status:r.status==="down"?"down":successes===clean.length?"ok":"degraded",
          diagnosis:[r.status==="down"?"DNS não resolveu nos resolvedores Cloudflare.":"Sonda DNS executada na Cloudflare Edge."],
          health_score:Math.round(100*successes/clean.length),
        }});
        await supabaseAdmin.from("cloudflare_dns_probes" as any)
          .update({applied:true}).eq("server_id",r.check.server_id).eq("checked_at",r.check.checked_at);
      },{concurrency:3});
      applied=outcome.filter(x=>x.status==="fulfilled").length;
      failed=outcome.filter(x=>x.status==="rejected").length;
    }
    return Response.json({ok:true,mode:primary?"cloudflare":"shadow",
      accepted:saved?.length??0,applied,failed,skipped:parsed.data.checks.length-good.length
    },{headers:{"cache-control":"no-store"}});
  }}}
});
