import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidFeature } from "@/lib/premium-feature-access";

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
// One source crest can be 2 MB, but the browser receives a 192px
// downscaled version after loading. Keep strict per-image/network limits.
const MAX_ASSET_BYTES=2_000_000;
const memory=new Map<string,{expires:number,data:string}>();
function detectImageMime(data:Buffer):string{
  if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return "image/jpeg";
  if(data.length>=12&&data.toString("ascii",0,4)==="RIFF"&&data.toString("ascii",8,12)==="WEBP")return "image/webp";
  if(data.length>=6&&/^GIF8[79]a$/.test(data.toString("ascii",0,6)))return "image/gif";
  if(data.length>=12&&data.toString("ascii",4,12).startsWith("ftypavif"))return "image/avif";
  const sample=data.subarray(0,500).toString("utf8").trimStart();
  if(/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(sample)&&
     !/<(?:script|foreignObject|iframe|object|embed)\b/i.test(data.toString("utf8"))&&
     !/\bon[a-z]+\s*=|javascript:|@import|url\s*\(\s*['"]?https?:|<image[^>]+href\s*=\s*['"]https?:/i.test(data.toString("utf8")))
    return "image/svg+xml";
  return "";
}
/** Strict bounded fetch of actual club emblem bytes. We follow only a
 * small number of redirects to other public HTTPS image hosts.
 * FTWB credentials are attached exclusively to FTWB's own hostname.
 */
async function requestBadgeImage(initial:string):Promise<Response|null>{
  let current=initial;
  const {isSafeFootballCrestUrl}=await import("@/lib/vitrine-football-crest-proof.server");
  for(let redirects=0;redirects<=2;redirects++){
    if(!isSafeFootballCrestUrl(current))return null;
    const host=new URL(current).hostname.toLowerCase();
    const headers:Record<string,string>={
      Accept:"image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml",
    };
    if(host==="ftwb.notiffly.com.br"&&process.env.FTWB_API_KEY)
      headers["x-api-key"]=process.env.FTWB_API_KEY;
    const response=await fetch(current,{
      headers,redirect:"manual",signal:AbortSignal.timeout(8500),cache:"no-store"
    });
    if(response.status>=300&&response.status<400){
      const location=response.headers.get("location");
      if(!location)return null;
      const target=new URL(location,current).toString();
      if(!isSafeFootballCrestUrl(target))return null;
      current=target;
      continue;
    }
    return response;
  }
  return null;
}
async function inlineUrl(url:string):Promise<string|null>{
  const cached=memory.get(url);
  if(cached && cached.expires>Date.now())return cached.data;
  try{
    const response=await requestBadgeImage(url);
    if(!response?.ok)return null;
    const reported=Number(response.headers.get("content-length")||0);
    if(reported>MAX_ASSET_BYTES)return null;
    // Do not allocate an unbounded response when content-length is omitted.
    const reader=response.body?.getReader();
    if(!reader)return null;
    const parts:Uint8Array[]=[];
    let size=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>MAX_ASSET_BYTES){await reader.cancel();return null;}
        parts.push(value);
      }
    }finally{reader.releaseLock();}
    if(size<30)return null;
    const bytes=Buffer.concat(parts.map(part=>Buffer.from(part)),size);
    const mime=detectImageMime(bytes);
    if(!mime)return null;
    const data="data:"+mime+";base64,"+bytes.toString("base64");
    memory.set(url,{expires:Date.now()+15*60_000,data});
    if(memory.size>160)memory.delete(memory.keys().next().value!);
    return data;
  }catch{return null;}
}
export const getVitrineFootballExportImages=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    // 16 images is a PER-REQUEST batch size, not a daily team or event limit.
    urls:z.array(z.string().url().max(2048)).max(16),
    date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    crestProofs:z.record(z.string()).optional(),
  }).parse(input))
  .handler(async({data,context})=>{
    await requirePaidFeature(context);
    const {verifyFootballCrestUrl}=await import("@/lib/vitrine-football-crest-proof.server");
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
