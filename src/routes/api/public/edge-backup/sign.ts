import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";
const bodySchema=z.object({
 bucket:z.enum(["database_export_15_11_26","database_export_19_11_26","promo-arts","vitrine-video-modelos"]),
 path:z.string().min(1).max(1024),
});
export const Route=createFileRoute("/api/public/edge-backup/sign")({
 server:{handlers:{POST:async({request})=>{
  const {authorizePrivateBackup,listPrivateBackupObjects}=await import("@/lib/private-backup-bridge.server");
  if(!await authorizePrivateBackup(request))return Response.json({ok:false,error:"unauthorized"},{status:401});
  const raw=await request.text();
  if(raw.length>1600)return Response.json({ok:false,error:"too_large"},{status:413});
  let parsed;
  try{parsed=bodySchema.parse(JSON.parse(raw));}catch{
   return Response.json({ok:false,error:"invalid_request"},{status:400});
  }
  const files=await listPrivateBackupObjects().catch(()=>null);
  const match=files?.find(f=>f.bucket===parsed.bucket&&f.path===parsed.path);
  if(!match)return Response.json({ok:false,error:"not_in_inventory"},{status:404});
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data,error}=await supabaseAdmin.storage.from(match.bucket).createSignedUrl(match.path,600);
  if(error||!data?.signedUrl)return Response.json({ok:false,error:"sign_failed"},{status:503});
  return Response.json({ok:true,url:data.signedUrl,size:match.size,updated_at:match.updated_at,
    content_type:match.content_type},{headers:{"cache-control":"no-store"}});
 }}}
});
