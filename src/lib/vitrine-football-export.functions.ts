import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidFeature } from "@/lib/premium-feature-access";
import {verifyFootballCrestUrl} from "@/lib/vitrine-football-crest-proof.server";

/** Fetch only well-known image CDNs and the project's hosted brand storage.
 * This is not an unrestricted URL fetch/proxy. Never allow arbitrary hosts.
 */
export function isAllowedPosterImageUrl(raw:string):boolean {
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.username||url.password||url.port)return false;
    const host=url.hostname.toLowerCase();
    return host==="ftwb.notiffly.com.br" ||
      host==="flagcdn.com" || host==="www.flagcdn.com" ||
      host==="a.espncdn.com" || host==="img.thesports.com" ||
      host==="media.api-sports.io" || host==="media.sportmonks.com" ||
      host==="upload.wikimedia.org" || host==="res.cloudinary.com" ||
      host==="storage.googleapis.com" || host==="lh3.googleusercontent.com" ||
      host==="sportscore.com" || host==="www.sportscore.com" ||
      host==="streammonitor.site" || host==="www.streammonitor.site" ||
      host==="yiwyfiaqehhmngqngxvx.supabase.co" ||
      (host.endsWith(".supabase.co") && host.split(".").length===3);
  }catch{return false;}
}
const MAX_ASSET_BYTES=1_100_000;
const allowedMimes=new Set(["image/png","image/jpeg","image/webp","image/gif"]);
const memory=new Map<string,{expires:number,data:string}>();
async function inlineUrl(url:string):Promise<string|null>{
  const cached=memory.get(url);
  if(cached && cached.expires>Date.now())return cached.data;
  try{
    const response=await fetch(url,{
      headers:{Accept:"image/png,image/jpeg,image/webp,image/gif"},
      redirect:"error",signal:AbortSignal.timeout(6500),cache:"no-store"
    });
    if(!response.ok)return null;
    const mime=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if(!allowedMimes.has(mime))return null;
    const reported=Number(response.headers.get("content-length")||0);
    if(reported>MAX_ASSET_BYTES)return null;
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength<30||bytes.byteLength>MAX_ASSET_BYTES)return null;
    const data="data:"+mime+";base64,"+Buffer.from(bytes).toString("base64");
    memory.set(url,{expires:Date.now()+15*60_000,data});
    if(memory.size>90)memory.delete(memory.keys().next().value!);
    return data;
  }catch{return null;}
}
export const getVitrineFootballExportImages=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    // 16 images is a PER-REQUEST batch size, not a daily team or event limit.
    urls:z.array(z.string().url().max(2048)).max(16),
    date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
    crestProofs:z.record(z.string()).optional(),
  }).parse(input))
  .handler(async({data,context})=>{
    await requirePaidFeature(context);
    const proofKey=process.env.FTWB_API_KEY||"";
    const unique=[...new Set(data.urls)].filter(url=>
      isAllowedPosterImageUrl(url) ||
      (!!data.date&&!!data.crestProofs?.[url]&&
       verifyFootballCrestUrl(url,data.date,data.crestProofs[url],proofKey))
    );
    const pairs=await Promise.all(unique.map(async url=>[url,await inlineUrl(url)] as const));
    const images:Record<string,string>={};
    for(const [url,inline] of pairs)if(inline)images[url]=inline;
    return {images,requested:data.urls.length,converted:Object.keys(images).length};
  });
