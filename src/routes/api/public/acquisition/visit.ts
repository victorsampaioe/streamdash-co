import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";
const payload=z.object({
  event_id:z.string().uuid(),
  stage:z.enum(["landing","signup"]),
  attribution:z.unknown().optional()
});
export const Route=createFileRoute("/api/public/acquisition/visit")({
  server:{handlers:{POST:async({request})=>{
    const type=request.headers.get("content-type")||"";
    if(!type.includes("application/json"))return Response.json({ok:false},{status:415});
    const source=request.headers.get("sec-fetch-site");
    if(source==="cross-site")return Response.json({ok:false},{status:403});
    const origin=request.headers.get("origin");
    if(origin){
      try{if(new URL(origin).host!==new URL(request.url).host)return Response.json({ok:false},{status:403});}
      catch{return Response.json({ok:false},{status:403});}
    }
    const raw=await request.text();
    if(raw.length>1300)return Response.json({ok:false},{status:413});
    let parsed;
    try{parsed=payload.parse(JSON.parse(raw));}
    catch{return Response.json({ok:false},{status:400});}
    // Funnel visits are opt-in browser measurements. No IP, cookie, email,
    // User-Agent or click identifier is copied into this record.
    const {sanitizeAcquisitionInput}=await import("@/lib/ad-attribution");
    const attributed=sanitizeAcquisitionInput(parsed.attribution);
    if(!attributed)return Response.json({ok:false,error:"consent_required"},{status:403});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {error}=await (supabaseAdmin as any).from("acquisition_page_events")
      .upsert({id:parsed.event_id,stage:parsed.stage,source:attributed.source,
        platform:attributed.platform,campaign_id:attributed.campaign_id,
        ad_id:attributed.ad_id},{onConflict:"id",ignoreDuplicates:true});
    if(error)return Response.json({ok:false},{status:503});
    return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
  }}}
});