import {createHash,timingSafeEqual} from "node:crypto";
import {supabaseAdmin} from "@/integrations/supabase/client.server";

/** Server-only SHA-256 bearer-token verifier for the dedicated Cloudflare DNS Worker.
 * The plaintext token lives exclusively as a Cloudflare Worker secret.
 * The database stores only its digest. No browser access or user token involved.
 */
export async function authorizeCloudflareDnsBridge(request:Request):Promise<boolean>{
  const raw=request.headers.get("authorization")??"";
  const token=raw.startsWith("Bearer ")?raw.slice(7):"";
  if(token.length<32||token.length>256||!/^[a-zA-Z0-9_-]+$/.test(token))return false;
  const {data,error}=await supabaseAdmin.from("app_settings")
    .select("value").eq("key","cf_dns_bridge_auth").maybeSingle();
  const expected=(data?.value as {sha256?:string}|null)?.sha256;
  if(error||!expected||!/^[a-f0-9]{64}$/i.test(expected))return false;
  const actual=createHash("sha256").update(token).digest();
  const reference=Buffer.from(expected,"hex");
  return actual.length===reference.length&&timingSafeEqual(actual,reference);
}

export async function getCloudflareDnsPrimary():Promise<boolean>{
  const {data,error}=await supabaseAdmin.from("app_settings")
    .select("value").eq("key","cf_dns_primary").maybeSingle();
  if(error)return false; // Fail safe: legacy checker stays responsible for alerts.
  return (data?.value as {mode?:string}|null)?.mode==="cloudflare";
}

/** Same fail-safe is used by both the cron and the report receiver.
 * A configured migration is not a cutover until recent, signed Cloudflare
 * probes cover at least 90% of active DNS targets.
 */
export async function cloudflareDnsReady():Promise<boolean>{
  if(!await getCloudflareDnsPrimary())return false;
  const threshold=new Date(Date.now()-15*60_000).toISOString();
  const [samples,active]=await Promise.all([
    (supabaseAdmin as any).from("cloudflare_dns_probes")
      .select("server_id,checked_at").gte("checked_at",threshold)
      .order("checked_at",{ascending:false}).limit(2000),
    supabaseAdmin.from("servers")
      .select("id",{head:true,count:"exact"})
      .eq("dns_enabled",true).eq("monitoring_paused",false),
  ]);
  if(samples.error||active.error||!samples.data?.length)return false;
  const newest=Date.parse(samples.data[0].checked_at);
  if(!Number.isFinite(newest)||Date.now()-newest>3*60_000)return false;
  const unique=new Set(samples.data.map((r:{server_id:string})=>r.server_id)).size;
  return unique>=Math.ceil(Math.max(1,active.count??0)*0.9);
}
