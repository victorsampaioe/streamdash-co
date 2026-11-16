import {createFileRoute} from "@tanstack/react-router";
export const Route=createFileRoute("/api/public/edge-backup/manifest")({
 server:{handlers:{GET:async({request})=>{
  const {authorizePrivateBackup,listPrivateBackupObjects}=await import("@/lib/private-backup-bridge.server");
  if(!await authorizePrivateBackup(request))return Response.json({ok:false,error:"unauthorized"},{status:401});
  try{
   const files=await listPrivateBackupObjects();
   return Response.json({ok:true,files,count:files.length},{headers:{"cache-control":"no-store"}});
  }catch(e){
   console.error("[edge-backup] manifest failed",e instanceof Error?e.name:"unknown");
   return Response.json({ok:false,error:"inventory_unavailable"},{status:503});
  }
 }}}
});
