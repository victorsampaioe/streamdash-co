import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";

/** One-time, server-to-server registration of a private backup secret digest.
 * The token never leaves Cloudflare. Only signed regional Workers may enroll,
 * and an existing digest cannot be overwritten by this endpoint.
 */
const requestSchema=z.object({
  sha256:z.string().regex(/^[a-f0-9]{64}$/),
  timestamp:z.number().int(),
  nonce:z.string().uuid()
});
export const Route=createFileRoute("/api/public/edge-backup/enroll")({
  server:{handlers:{POST:async({request})=>{
    if(Number(request.headers.get("content-length")||0)>1000)
      return Response.json({ok:false,error:"too_large"},{status:413});
    const raw=await request.text();
    if(raw.length>1000)return Response.json({ok:false,error:"too_large"},{status:413});
    const {verifyRegionSignature}=await import("@/lib/region-auth.server");
    const {verifyCloudflareEdgeSignature}=await import("@/lib/region-cloudflare-auth.server");
    const trusted=verifyRegionSignature(raw,request.headers.get("x-signature"))
      ||await verifyCloudflareEdgeSignature(raw,request.headers.get("x-cf-signature"));
    if(!trusted)return Response.json({ok:false,error:"unauthorized"},{status:401});
    let data;
    try{data=requestSchema.parse(JSON.parse(raw));}
    catch{return Response.json({ok:false,error:"bad_request"},{status:400});}
    if(Math.abs(Date.now()-data.timestamp)>120000)
      return Response.json({ok:false,error:"expired"},{status:400});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:current,error:readError}=await supabaseAdmin.from("app_settings")
      .select("value").eq("key","cf_private_backup_auth").maybeSingle();
    if(readError)return Response.json({ok:false,error:"storage_unavailable"},{status:503});
    const digest=(current?.value as {sha256?:string}|null)?.sha256;
    if(digest){
      if(digest===data.sha256)return Response.json({ok:true,already:true},
        {headers:{"cache-control":"no-store"}});
      return Response.json({ok:false,error:"different_secret_already_registered"},{status:409});
    }
    const {error}=await supabaseAdmin.from("app_settings")
      .insert({key:"cf_private_backup_auth",
        value:{sha256:data.sha256,registered_at:new Date().toISOString(),method:"signed_internal_rpc"},
        updated_at:new Date().toISOString()});
    if(error)return Response.json({ok:false,error:"register_failed"},{status:503});
    return Response.json({ok:true,enrolled:true},{headers:{"cache-control":"no-store"}});
  }}}
});
