import {createFileRoute} from "@tanstack/react-router";

export const Route=createFileRoute("/api/public/edge-dns/targets")({
  server:{handlers:{GET:async({request})=>{
    const {authorizeCloudflareDnsBridge}=await import("@/lib/cloudflare-dns-bridge.server");
    const {verifyRegionSignature}=await import("@/lib/region-auth.server");
    const {verifyCloudflareEdgeSignature}=await import("@/lib/region-cloudflare-auth.server");
    const signature="dns-targets";
    const verified=await authorizeCloudflareDnsBridge(request)
      ||verifyRegionSignature(signature,request.headers.get("x-signature"))
      ||await verifyCloudflareEdgeSignature(signature,request.headers.get("x-cf-signature"));
    if(!verified)return Response.json({error:"unauthorized"},{status:401});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {getActiveOwnerIds}=await import("@/lib/service-status.server");
    const {data,error}=await supabaseAdmin.from("servers")
      .select("id,owner_id,host,dns_status,dns_enabled,monitoring_paused")
      .eq("dns_enabled",true).eq("monitoring_paused",false).is("auto_excluded_at",null)
      .order("id",{ascending:true}).limit(5000);
    if(error)return Response.json({error:"targets_unavailable"},{status:503});
    const active=await getActiveOwnerIds((data??[]).map(s=>s.owner_id));
    const targets=(data??[]).filter(s=>active.has(s.owner_id))
      .map(s=>({server_id:s.id,host:s.host,dns_status:s.dns_status}));
    return Response.json({ok:true,targets,count:targets.length},{headers:{"cache-control":"no-store"}});
  }}}
});
