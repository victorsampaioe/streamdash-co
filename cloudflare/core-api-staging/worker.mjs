/**
 * Stream Monitor — Cloudflare staging API for tenant-scoped metadata.
 *
 * This Worker is PRIVATE (workers.dev and preview URLs disabled), READ-ONLY,
 * and NOT an authentication provider. No production login, payments, tenant
 * entitlements, sessions or Telegram traffic are switched to it.
 *
 * User access is denied unless a Cloudflare-issued signed session and a
 * matching non-revoked D1 session exist. No JWTs can be minted here.
 * Never expose staging records publicly or enable a route to production.
 */

const HEADERS={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "X-Robots-Tag":"noindex, nofollow",
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decode64url(value){
  if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>4096)throw Error("invalid_encoded_token");
  const data=value.replace(/-/g,"+").replace(/_/g,"/");
  const str=atob(data.padEnd(Math.ceil(data.length/4)*4,"="));
  return Uint8Array.from(str,c=>c.charCodeAt(0));
}
function utf8(bytes){return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}

export async function verifyStageSession(request,env,now=Date.now()){
  const secret=env.STAGE_SESSION_SIGNING_KEY;
  if(typeof secret!=="string"||secret.length<64||!env.MIGRATION_DB)
    return {error:"not_configured",status:503};
  const header=request.headers.get("authorization")||"";
  const match=/^Bearer ([A-Za-z0-9_.-]{20,4096})$/.exec(header);
  if(!match)return {error:"authentication_required",status:401};
  const token=match[1],parts=token.split(".");
  if(parts.length!==3)return {error:"invalid_session",status:401};
  try{
    const [h,p,s]=parts;
    const head=JSON.parse(utf8(decode64url(h)));
    const payload=JSON.parse(utf8(decode64url(p)));
    if(head.alg!=="HS256"||head.typ!=="JWT"||
       payload.iss!=="streammonitor-cloudflare-auth"||
       payload.aud!=="streammonitor-core-stage"||
       !UUID.test(String(payload.sub||""))||
       !UUID.test(String(payload.sid||""))||
       !Number.isSafeInteger(payload.exp)||
       !Number.isSafeInteger(payload.iat)||
       payload.iat>Math.floor(now/1000)+60||
       payload.exp<=Math.floor(now/1000)||
       payload.exp>Math.floor(now/1000)+15*60)throw Error("claims");
    const key=await crypto.subtle.importKey(
      "raw",new TextEncoder().encode(secret),
      {name:"HMAC",hash:"SHA-256"},false,["verify"]
    );
    const ok=await crypto.subtle.verify(
      "HMAC",key,decode64url(s),new TextEncoder().encode(h+"."+p)
    );
    if(!ok)throw Error("signature");
    const session=await env.MIGRATION_DB.prepare(
      "SELECT user_id,expires_at,revoked_at FROM migration_auth_sessions_stage WHERE session_id=?"
    ).bind(payload.sid).first();
    if(!session||session.user_id!==payload.sub||session.revoked_at||
       Date.parse(session.expires_at)<=now)throw Error("revoked");
    const profile=await env.MIGRATION_DB.prepare(
      "SELECT user_id FROM migration_users_stage WHERE user_id=?"
    ).bind(payload.sub).first();
    if(!profile)throw Error("unknown_user");
    return {userId:payload.sub};
  }catch{
    return {error:"invalid_session",status:401};
  }
}

export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(request.method==="GET"&&path==="/health")
      return json({ok:true,environment:"private_staging",cutover:false,
        production_authoritative:false,login_enabled:false});
    if(!path.startsWith("/v1/"))return json({error:"not_found"},404);
    if(request.method!=="GET")return json({error:"method_not_allowed"},405);
    if(!env.MIGRATION_DB)return json({error:"database_unavailable"},503);
    try{
      const gate=await env.MIGRATION_DB.prepare(
        "SELECT enabled FROM migration_cutover_control WHERE id=1"
      ).first();
      if(!gate||gate.enabled!==0)return json({error:"staging_gate_locked"},503);
      const auth=await verifyStageSession(request,env);
      if(auth.error)return json({error:auth.error},auth.status);
      const userId=auth.userId;
      const db=env.MIGRATION_DB;
      if(path==="/v1/profile"){
        const profile=await db.prepare(
          "SELECT user_id,username,email,display_name,credits FROM migration_users_stage WHERE user_id=?"
        ).bind(userId).first();
        if(!profile)return json({error:"not_found"},404);
        return json({ok:true,mode:"STAGING_READ_ONLY",profile});
      }
      if(path==="/v1/servers"){
        const u=new URL(request.url);
        const limit=Math.min(50,Math.max(1,Number(u.searchParams.get("limit"))||25));
        const after=u.searchParams.get("after")||"";
        if(after&&!UUID.test(after))return json({error:"invalid_cursor"},400);
        const result=await db.prepare(
          "SELECT server_id,name,host,current_status,dns_status,health_score " +
          "FROM migration_servers_stage s WHERE owner_id=? AND server_id>? " +
          "AND NOT EXISTS (SELECT 1 FROM migration_shadow_tombstones x " +
          "WHERE x.source_table='servers' AND x.source_id=s.server_id) " +
          "ORDER BY server_id LIMIT ?"
        ).bind(userId,after,limit).all();
        return json({ok:true,mode:"STAGING_READ_ONLY",servers:result.results||[]});
      }
      if(path==="/v1/subscriptions"){
        const result=await db.prepare(
          "SELECT subscription_id,plan,status,started_at,expires_at FROM migration_subscriptions_stage " +
          "WHERE user_id=? ORDER BY source_updated_at DESC LIMIT 25"
        ).bind(userId).all();
        return json({ok:true,mode:"STAGING_READ_ONLY",subscriptions:result.results||[]});
      }
      if(path==="/v1/payments"){
        const result=await db.prepare(
          "SELECT payment_id,status,amount_cents,paid_at FROM migration_payments_stage " +
          "WHERE user_id=? ORDER BY source_updated_at DESC LIMIT 25"
        ).bind(userId).all();
        return json({ok:true,mode:"STAGING_READ_ONLY",payments:result.results||[]});
      }
      return json({error:"not_found"},404);
    }catch{
      return json({error:"staging_backend_unavailable"},503);
    }
  }
};
