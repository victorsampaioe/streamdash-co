/**
 * Stream Monitor migration read-only drift monitor.
 * This Worker DOES NOT perform database cutover, authenticate customers,
 * decrypt credentials, submit payments, or deliver notifications.
 */
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const KEYS=["profiles","auth_users","roles","servers","subscriptions","payments","alert_channels","telegram_outbox","credentialed_servers","active_pg_cron","storage_objects"];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
async function authorized(request,env){
 const auth=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization")||"");
 if(!auth||!/^[a-f0-9]{64}$/.test(env.MIGRATION_RECONCILE_TOKEN||""))return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([
  crypto.subtle.digest("SHA-256",enc.encode(auth[1])),
  crypto.subtle.digest("SHA-256",enc.encode(env.MIGRATION_RECONCILE_TOKEN))
 ]);
 let mismatch=0;
 const x=new Uint8Array(a),y=new Uint8Array(b);
 for(let i=0;i<32;i++)mismatch|=x[i]^y[i];
 return mismatch===0;
}
function valid(body){
 if(!body||typeof body!=="object"||Array.isArray(body))return false;
 if(Object.keys(body).sort().join(",")!=="counts,schema_version,source_time_ms")return false;
 if(body.schema_version!==1||!Number.isSafeInteger(body.source_time_ms)||
  Math.abs(Date.now()-body.source_time_ms)>600_000)return false;
 if(!body.counts||typeof body.counts!=="object"||Array.isArray(body.counts)||
   Object.keys(body.counts).sort().join(",")!==KEYS.slice().sort().join(","))return false;
 return KEYS.every(k=>Number.isSafeInteger(body.counts[k])&&body.counts[k]>=0&&body.counts[k]<=1e10);
}
const SNAPSHOT_V2_KEYS=[
  "profiles","auth_users","roles","servers","subscriptions","payments",
  "alert_channels","telegram_outbox","credentialed_servers",
];
const SNAPSHOT_V2_PATH="/api/public/migration/snapshot";
const SNAPSHOT_V2_ORIGIN="https://project--53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd.lovable.app";
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
/**
 * Periodic read-only count reconciliation. Dedicated ECDSA private key lives
 * ONLY in Cloudflare Worker secret binding. The source route knows only its
 * public key. No row-level customer data, hashes, Pix tokens or IPTV credentials
 * cross this bridge.
 */
async function refreshSignedSourceCounts(env) {
 if(!env.MIGRATION_DB||!env.MIGRATION_SNAPSHOT_SIGNING_JWK)return;
 const control=await env.MIGRATION_DB.prepare(
   "SELECT (SELECT enabled FROM migration_cutover_control WHERE id=1) AS cutover,"+
   "(SELECT enabled FROM migration_alert_dispatch_control WHERE id=1) AS dispatch"
 ).first();
 if(control?.cutover!==0||control?.dispatch!==0)throw Error("staging_gate_locked");
 const timestamp=String(Date.now());
 const message=["streammonitor-migration-snapshot-v2",timestamp,"GET",SNAPSHOT_V2_PATH].join("\n");
 const jwk=JSON.parse(env.MIGRATION_SNAPSHOT_SIGNING_JWK);
 if(jwk.kty!=="EC"||jwk.crv!=="P-256"||!jwk.d)throw Error("signing_key_invalid");
 const key=await crypto.subtle.importKey(
   "jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]
 );
 const signed=await crypto.subtle.sign(
   {name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(message)
 );
 const res=await fetch(SNAPSHOT_V2_ORIGIN+SNAPSHOT_V2_PATH,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{
     "accept":"application/json",
     "x-sm-migration-time":timestamp,
     "x-sm-migration-signature":hex(signed),
   },
   signal:AbortSignal.timeout(15000),
 });
 if(!res.ok)throw Error("source_unavailable_"+res.status);
 if(!(res.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
   throw Error("source_content_type_invalid");
 const body=await res.text();
 if(body.length>3200)throw Error("source_response_too_large");
 const parsed=JSON.parse(body);
 if(parsed?.ok!==true||parsed.schema_version!==2||
    parsed.authority!=="lovable-cloud"||parsed.migration_mode!=="READ_ONLY"||
    !Number.isSafeInteger(parsed.source_time_ms)||
    Math.abs(Date.now()-parsed.source_time_ms)>120000||
    !parsed.counts||typeof parsed.counts!=="object"||Array.isArray(parsed.counts)||
    Object.keys(parsed.counts).sort().join(",")!==SNAPSHOT_V2_KEYS.slice().sort().join(",")||
    !SNAPSHOT_V2_KEYS.every(k=>Number.isSafeInteger(parsed.counts[k])&&parsed.counts[k]>=0&&parsed.counts[k]<=10_000_000))
    throw Error("invalid_source_counts");
 const stage=await stageCounts(env.MIGRATION_DB);
 const drift={};
 for(const key of SNAPSHOT_V2_KEYS)drift[key]=parsed.counts[key]-stage[key];
 drift.auth_password_envelopes_missing=parsed.counts.auth_users-stage.auth_secrets;
 drift.encrypted_server_credentials_missing=parsed.counts.credentialed_servers-stage.encrypted_server_credentials;
 const critical=Object.values(drift).some(v=>v!==0);
 const saved=await env.MIGRATION_DB.prepare(
   "INSERT OR IGNORE INTO migration_readonly_source_counts(source_time_ms,received_at_ms,source_counts_json,"+
   "stage_counts_json,drift_json,has_critical_drift,mode) VALUES(?,?,?,?,?,?,'READ_ONLY')"
 ).bind(parsed.source_time_ms,Date.now(),JSON.stringify(parsed.counts),
   JSON.stringify(stage),JSON.stringify(drift),critical?1:0).run();
 if(saved?.meta?.changes===0)throw Error("source_snapshot_duplicate");
 await env.MIGRATION_DB.prepare("DELETE FROM migration_readonly_source_counts WHERE received_at_ms<?")
   .bind(Date.now()-30*86400_000).run();
 // The migration remains blocked until encrypted secrets, payments, storage,
 // auth and restore checks are all independently verified.
}

async function stageCounts(db){
 const q=await db.prepare(
  "SELECT "+
  "(SELECT COUNT(*) FROM migration_users_stage) AS profiles,"+
  "(SELECT COUNT(*) FROM migration_auth_accounts_stage) AS auth_users,"+
  "(SELECT COUNT(*) FROM migration_roles_stage) AS roles,"+
  "(SELECT COUNT(*) FROM migration_servers_stage WHERE server_id NOT IN "+
  "(SELECT source_id FROM migration_shadow_tombstones WHERE source_table='servers')) AS servers,"+
  "(SELECT COUNT(*) FROM migration_subscriptions_stage) AS subscriptions,"+
  "(SELECT COUNT(*) FROM migration_payments_stage) AS payments,"+
  "(SELECT COUNT(*) FROM migration_alert_channels_stage) AS alert_channels,"+
  "(SELECT COUNT(*) FROM migration_telegram_outbox_stage) AS telegram_outbox,"+
  "(SELECT COUNT(*) FROM migration_servers_stage WHERE credentials_present=1 AND server_id NOT IN "+
  "(SELECT source_id FROM migration_shadow_tombstones WHERE source_table='servers')) AS credentialed_servers,"+
  "(SELECT COUNT(*) FROM migration_auth_secret_envelopes) AS auth_secrets,"+
  "(SELECT COUNT(*) FROM migration_server_credentials_encrypted_stage) AS encrypted_server_credentials"
 ).first();
 if(!q)throw Error("staging_unavailable");
 return q;
}
/**
 * Periodic, internal-only safety report. Never claims full cutover readiness.
 * Real source-count reconciliation requires separately configured private auth.
 */
async function internalGateScan(env){
 if(!env.MIGRATION_DB)return;
 const stage=await stageCounts(env.MIGRATION_DB);
 const flags=await env.MIGRATION_DB.prepare(
  "SELECT "+
  "(SELECT enabled FROM migration_cutover_control WHERE id=1) AS cutover_enabled,"+
  "(SELECT enabled FROM migration_alert_dispatch_control WHERE id=1) AS historical_alerts_enabled,"+
  "(SELECT COUNT(*) FROM migration_shadow_tombstones WHERE source_table='servers') AS old_server_ids"
 ).first();
 if(flags?.cutover_enabled!==0||flags?.historical_alerts_enabled!==0)
  throw Error("safety_gate_unexpected_enabled");
 const latest=await env.MIGRATION_DB.prepare(
   "SELECT received_at_ms FROM migration_readonly_source_counts ORDER BY received_at_ms DESC LIMIT 1"
 ).first();
 const sourceFresh=Number(latest?.received_at_ms||0)>Date.now()-30*60_000;
 const report={
  source_counts_fresh:sourceFresh,auth_accounts:stage.auth_users,
  auth_encrypted_hashes:stage.auth_secrets,encrypted_server_credentials:stage.encrypted_server_credentials,
  profiles:stage.profiles,roles:stage.roles,servers:stage.servers,
  subscriptions:stage.subscriptions,payments:stage.payments,
  telegram_channels:stage.alert_channels,telegram_outbox:stage.telegram_outbox,
  server_tombstones:flags.old_server_ids,
  production_cutover_enabled:false,can_release:false
 };
 await env.MIGRATION_DB.prepare(
  "INSERT INTO migration_internal_gate_snapshots(checked_at_ms,metrics_json,ready,mode) "+
  "VALUES(?,?,0,'READ_ONLY')"
 ).bind(Date.now(),JSON.stringify(report)).run();
 await env.MIGRATION_DB.prepare(
  "DELETE FROM migration_internal_gate_snapshots WHERE checked_at_ms<?"
 ).bind(Date.now()-30*86400_000).run();
}
export default {
 async scheduled(_event,env,ctx){
  ctx.waitUntil(internalGateScan(env).catch(()=>{}));
  ctx.waitUntil(refreshSignedSourceCounts(env).catch(e=>
    console.warn("migration_signed_snapshot_failed",String(e?.message||e).slice(0,90))));
 },
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/health"&&request.method==="GET")return json({ok:true,mode:"READ_ONLY"});
  if(url.pathname!=="/source/snapshot"||request.method!=="POST")return json({error:"not_found"},404);
  if(!env.MIGRATION_RECONCILE_TOKEN||!env.MIGRATION_DB)return json({error:"service_not_configured"},503);
  if(!await authorized(request,env))return json({error:"unauthorized"},401);
  if((request.headers.get("content-type")||"").split(";")[0].trim()!=="application/json")
   return json({error:"invalid_media_type"},415);
  const length=Number(request.headers.get("content-length")||"0");
  if(length>3500)return json({error:"payload_too_large"},413);
  const raw=await request.text();
  if(raw.length>3500)return json({error:"payload_too_large"},413);
  let body;
  try{body=JSON.parse(raw)}catch{return json({error:"invalid_json"},400)}
  if(!valid(body))return json({error:"invalid_counts"},400);
  try{
   const stage=await stageCounts(env.MIGRATION_DB);
   const drift={};
   for(const key of KEYS){
    if(key in stage)drift[key]=body.counts[key]-stage[key];
   }
   drift.auth_password_envelopes_missing=body.counts.auth_users-stage.auth_secrets;
   drift.encrypted_server_credentials_missing=body.counts.credentialed_servers-stage.encrypted_server_credentials;
   const critical=Object.values(drift).some(v=>v!==0);
   // Single-key timestamp makes retries idempotent.
   const insert=await env.MIGRATION_DB.prepare(
    "INSERT OR IGNORE INTO migration_readonly_source_counts("+
    "source_time_ms,received_at_ms,source_counts_json,stage_counts_json,drift_json,has_critical_drift,mode) "+
    "VALUES(?,?,?,?,?,?,'READ_ONLY')"
   ).bind(body.source_time_ms,Date.now(),JSON.stringify(body.counts),JSON.stringify(stage),JSON.stringify(drift),critical?1:0).run();
   // Only purge records produced by this read-only monitor.
   await env.MIGRATION_DB.prepare(
    "DELETE FROM migration_readonly_source_counts WHERE received_at_ms<?"
   ).bind(Date.now()-30*86400_000).run();
   return json({ok:true,accepted:!!insert.meta?.changes,has_critical_drift:critical,mode:"READ_ONLY"});
  }catch{
   return json({error:"read_only_reconciliation_unavailable"},503);
  }
 }
};