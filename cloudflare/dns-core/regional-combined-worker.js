/**
 * Stream Monitor: independent, low-cost Cloudflare edge probe.
 * Cloudflare cron does NOT guarantee physical São Paulo placement.
 * Independent probe with ECDSA signature; no IPTV credentials in this runtime.
 *
 * Env: ENDPOINT_BASE, REGION_CODE and one Cloudflare secret binding:
 * REGION_WORKER_SECRET (same existing Lovable environment value) OR
 * SIGNING_KEY_JWK (private ECDSA key; public JWK in Lovable app_settings).
 * Cron: every minute; 30 rotating HTTP targets, 1 targets call, 1 report call.
 */
import { recordSample } from "./monitor-store.mjs";
import { targetLanes } from "./monitor-state.mjs";
import { readMirrorTargets, readCachedDnsTargets } from "./mirror-fallback.mjs";

const MAX_TARGETS = 30;
const CONCURRENCY = 5;
const TIMEOUT = 6500;

async function signatureHeaders(env, message) {
  // Support asymmetric key-pair signing and the existing shared regional
  // secret. Neither secret is ever bundled into source code.
  const bytes = new TextEncoder().encode(message);
  if (env.SIGNING_KEY_JWK) {
    const key = await crypto.subtle.importKey("jwk", JSON.parse(env.SIGNING_KEY_JWK),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bytes);
    return { "x-cf-signature": [...new Uint8Array(signature)]
      .map(b => b.toString(16).padStart(2, "0")).join("") };
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.REGION_WORKER_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, bytes);
  return { "x-signature": [...new Uint8Array(signature)]
    .map(b => b.toString(16).padStart(2, "0")).join("") };
}

function config(env) {
  if (!env.ENDPOINT_BASE || !(env.SIGNING_KEY_JWK || env.REGION_WORKER_SECRET) || !env.REGION_CODE)
    throw new Error("Worker configuration incomplete");
  if (new URL(env.ENDPOINT_BASE).protocol !== "https:") throw new Error("HTTPS required");
}

async function jsonOrFail(res) {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`HTTP ${res.status}`);
  return body;
}

async function getTargets(env) {
  try {
    const message = "targets";
    const response = await jsonOrFail(await fetch(`${env.ENDPOINT_BASE}/api/public/regions/targets`, {
      headers: await signatureHeaders(env, message),
      signal: AbortSignal.timeout(TIMEOUT),
    }));
    if (!Array.isArray(response.targets) || response.targets.length > 3000)
      throw new Error("invalid_http_inventory");
    return response.targets;
  } catch (error) {
    // A recent, signed origin inventory was already mirrored to D1.
    // During a temporary origin outage keep probing, never issue customer alerts.
    const stored = await readMirrorTargets(env.DNS_DB);
    const fallback = stored.map(t => ({
      server_id: t.server_id, host: t.host,
      last_checked_at: t.checked_at_ms ? new Date(Number(t.checked_at_ms)).toISOString() : null,
    }));
    Object.defineProperty(fallback, "isCloudflareMirror", {value:true});
    console.warn("edge_http_local_fallback", String(error?.message ?? error).slice(0,100));
    return fallback;
  }
}

function safeUrl(host) {
  const raw = String(host ?? "").trim();
  // Accept domains, IPv4, optional explicit port; never credentials or paths.
  if (!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(raw)) return null;
  const url = new URL("http://" + raw + "/");
  if (url.username || url.password) return null;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127|0|10|192\.168|169\.254|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return null;
  if (![80,8080,8000,8880,2052,2082,2086,2095].includes(Number(url.port || "80"))) return null;
  return url.toString();
}

async function check(target, region) {
  const started = Date.now();
  let status = "unknown", http_status = null, error = null;
  const url = safeUrl(target.host);
  if (!url) {
    return { server_id: target.server_id, region_code: region, status,
      latency_ms: 0, http_status, error: "Endereço não suportado pelo Worker",
      source: "worker" };
  }
  try {
    const res = await fetch(url, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT),
      headers: { "user-agent": "StreamMonitor-CF-Edge/1.0" },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    http_status = res.status;
    if (res.body) await res.body.cancel().catch(() => {});
    const elapsed = Date.now() - started;
    status = http_status >= 200 && http_status < 400 ? elapsed > 3000 ? "degraded" : "up"
      : http_status === 401 || http_status === 403 || http_status === 404 || http_status === 429
        ? "degraded" : http_status >= 500 ? "down" : "unknown";
  } catch (e) {
    status = "unknown";
    error = e?.name === "TimeoutError" ? "Timeout de conexão" : "Falha de conexão HTTP";
  }
  return { server_id: target.server_id, region_code: region, status,
    http_status, latency_ms: Date.now() - started, error, source: "worker" };
}

async function pool(targets, region) {
  const result = new Array(targets.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      result[i] = await check(targets[i], region);
    }
  }));
  return result;
}


/**
 * Fair HTTP probe scheduling:
 * - Up to 27 oldest checked / never-checked targets
 * - At least 3 stable rotating targets for eventual progress even if reports fail
 * - No simultaneous target duplication, no private IPTV credentials
 *
 * `last_checked_at` is sourced from the signed inventory; the origin remains the
 * only authoritative writer of health and incident transitions.
 */
export function selectHttpTargets(all, now=Date.now(), maxTargets=MAX_TARGETS) {
  if (!Array.isArray(all) || maxTargets <= 0) return [];
  if (all.length <= maxTargets) return [...all];
  const stamp = t => {
    const date = t?.last_checked_at ? Date.parse(t.last_checked_at) : NaN;
    return Number.isFinite(date) ? date : 0;
  };
  const byId = (a,b) => String(a.server_id).localeCompare(String(b.server_id));
  const oldest = [...all].sort((a,b) => stamp(a)-stamp(b) || byId(a,b));
  const rotatingSlots = Math.min(3, Math.max(1, Math.floor(maxTargets/6)));
  const priority = oldest.slice(0,maxTargets-rotatingSlots);
  const used = new Set(priority.map(x => x.server_id));
  // The rotation uses the unchanged complete inventory, not an array
  // shortened by dynamic priority selections (which caused repeated gaps).
  const fixed = [...all].sort(byId);
  const start = (Math.floor(now/60000)*rotatingSlots) % fixed.length;
  const rest = [];
  for (let i=0;i<fixed.length && rest.length<rotatingSlots;i++){
    const item = fixed[(start+i)%fixed.length];
    if (!used.has(item.server_id)){rest.push(item);used.add(item.server_id);}
  }
  return [...priority,...rest];
}

async function tick(env) {
  config(env);
  const all = await getTargets(env);
  if (!Array.isArray(all)) throw new Error("Invalid target list");
  if (all.length === 0) {
    return { ok: true, targets: 0, checked: 0, reported: 0 };
  }
  if (all.isCloudflareMirror) {
    // No Telegram priority jobs or source status transitions during origin outages.
    return reportHttpTargets(env, selectHttpTargets(all, Date.now(), MAX_TARGETS), true);
  }
  // D1 guard is opt-in until schema and public-state handoff are verified.
  if (env.MONITOR_GUARD_MODE === "shadow" && env.DNS_DB) {
    const rows = await env.DNS_DB.prepare("SELECT server_id,state_json FROM monitor_state WHERE json_extract(state_json,'$.incident.id') IS NOT NULL").all();
    const priority = new Set((rows.results ?? []).map(row => row.server_id));
    const lanes = targetLanes(all.map(t => ({ ...t, priority: priority.has(t.server_id) })), Math.floor(Date.now() / 60000), MAX_TARGETS);
    if (lanes.priority.length && !env.TELEGRAM_DELIVERY_QUEUE) throw new Error("monitor_priority_queue_missing");
    for (let i = 0; i < lanes.priority.length; i += 5) {
      await env.TELEGRAM_DELIVERY_QUEUE.send({ action: "monitor-priority", id: crypto.randomUUID(), ts: Date.now(), targets: lanes.priority.slice(i, i + 5) });
    }
    return reportHttpTargets(env, lanes.normal);
  }
  // Oldest HTTP result always wins. A position-based modulo slice may skip
  // servers when the overdue priority lane changes length between minutes.
  // Keep a small independent ID-rotation lane so a permanently unreportable
  // target cannot occupy the whole budget and starve healthy targets.
  const targets = selectHttpTargets(all, Date.now(), MAX_TARGETS);
  return reportHttpTargets(env, targets);
}
async function reportHttpTargets(env, targets, localOnly=false) {
  if (!targets.length) return { ok: true, checked: 0 };
  const reports = await pool(targets, env.REGION_CODE);
  if (localOnly) {
    // Store raw observations in D1; do not send notifications or update
    // customer-visible status until the authoritative backend is available.
    if (!env.DNS_DB) throw new Error("dns_db_missing");
    const observedAt = Date.now();
    const valid = reports.filter(r => ["up","down","degraded","unknown","pending"].includes(r.status));
    const statements = valid.map(r => env.DNS_DB.prepare(
      "INSERT OR IGNORE INTO edge_http_samples(server_id,region_code,checked_at_ms,status,http_status,latency_ms,source) VALUES(?,?,?,?,?,?,'regional_cloudflare')"
    ).bind(r.server_id, r.region_code, observedAt, r.status, r.http_status, r.latency_ms));
    for (let i=0; i<statements.length; i+=30) await env.DNS_DB.batch(statements.slice(i,i+30));
    return {ok:true,checked:valid.length,reported:0,mode:"CLOUDFLARE_LOCAL_ONLY"};
  }
  if (env.MONITOR_GUARD_MODE === "shadow" && env.DNS_DB) {
    for (const report of reports) await recordSample(env.DNS_DB, report.server_id, {
      kind: "http", at: Date.now(), proofs: [{ source: env.REGION_CODE,
        verdict: report.status === "up" ? "ok" : report.status === "down" ? "down" : "unknown" }]
    });
  }
  const body = JSON.stringify({ reports });
  const authHeaders = await signatureHeaders(env, body);
  const reply = await jsonOrFail(await fetch(`${env.ENDPOINT_BASE}/api/public/regions/report`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body, signal: AbortSignal.timeout(15000),
  }));
  return { ok: true, checked: targets.length, reported: reply.inserted ?? 0 };
}

const regionalWorker = {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env).then(result => console.log("monitor tick", result))
      .catch(e => console.error("monitor tick failed", String(e?.message ?? e))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({
      service: "Stream Monitor Cloudflare Edge", region: env.REGION_CODE ?? "unconfigured",
      location: "Cloudflare edge (not guaranteed São Paulo)", configured: !!(env.SIGNING_KEY_JWK || env.REGION_WORKER_SECRET),
    });
    // Only scheduled cron can initiate probes, never an anonymous HTTP caller.
    return new Response("Not found", { status: 404 });
  },
};

// Independently scheduled DNS-over-HTTPS engine (shadow mode until verified).
/**
 * Stream Monitor DNS Core — Cloudflare Workers + Cron + D1.
 * All DNS-over-HTTPS probes happen on Cloudflare, never on the UI/host.
 * The existing application is temporarily the authoritative state/Telegram
 * writer; its legacy DNS cron stays on until these reports are verified.
 * No IPTV credentials and no plaintext API tokens in source/D1.
 */
const ORIGIN="https://streammonitor.site";
const MAX_NORMAL=34,MAX_PRIORITY=8,MAX_THIRD=10;
const DNS_TIMEOUT_MS=5500,HTTP_TIMEOUT_MS=18000;
const RESOLVERS=[
  {code:"cloudflare",base:"https://cloudflare-dns.com/dns-query"},
  {code:"google",base:"https://dns.google/resolve"},
  {code:"adguard",base:"https://dns.adguard-dns.com/resolve"},
];
const validIpv4=ip=>typeof ip==="string"&&/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)
  &&ip.split(".").every(s=>Number(s)>=0&&Number(s)<=255);
function hostName(raw){
  const host=String(raw??"").trim().toLowerCase().replace(/^https?:\/\//,"")
    .split("/")[0].replace(/:\d+$/,"").replace(/\.$/,"");
  if(host.length>253||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host))return null;
  if(host.endsWith(".local")||host.endsWith(".internal")||host==="localhost")return null;
  if(validIpv4(host))return null; // An IP literal isn't a DNS A-record query.
  return host;
}
async function api(env,path,method="GET",payload){
  const raw=payload===undefined?undefined:JSON.stringify(payload);
  const headers=await signatureHeaders(env,raw??"dns-targets");
  if(raw!==undefined)headers["content-type"]="application/json";
  const response=await fetch(ORIGIN+path,{method,headers,body:raw,
    cache:"no-store",signal:AbortSignal.timeout(HTTP_TIMEOUT_MS)});
  if(!response.ok)throw new Error("origin_http_"+response.status);
  const data=await response.json();
  if(!data||data.ok!==true)throw new Error("origin_invalid_response");
  return data;
}
async function readMeta(env,key){
  const r=await env.DNS_DB.prepare("SELECT value FROM dns_worker_meta WHERE key=?").bind(key).first();
  return r?.value??null;
}
async function putMeta(env,key,value){
  await env.DNS_DB.prepare("INSERT INTO dns_worker_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value)).run();
}
async function sha256(text){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function inventory(env){
  let refreshed=false,fetchError=null;
  try{
    const response=await api(env,"/api/public/edge-dns/targets");
    const source=response.targets;
    if(!Array.isArray(source)||source.length>3000||source.length===0)throw new Error("invalid_inventory");
    const dedup=new Map();
    for(const t of source){
      const h=hostName(t.host);
      if(!h||!/^[-a-f0-9]{36}$/i.test(String(t.server_id)))continue;
      dedup.set(t.server_id,{server_id:t.server_id,host:t.host,
        status:["online","unstable","offline"].includes(t.dns_status)?t.dns_status:"unknown"});
    }
    if(!dedup.size)throw new Error("empty_valid_inventory");
    const targets=[...dedup.values()].sort((a,b)=>a.server_id.localeCompare(b.server_id));
    // Reject unexpectedly truncated inventories; do not de-register monitored DNS on a partial origin response.
    const previous=await env.DNS_DB.prepare("SELECT COUNT(*) AS n FROM dns_targets WHERE active=1").first();
    if(Number(previous?.n||0)>=40 && targets.length<Number(previous.n)*0.5)
      throw new Error("suspicious_inventory_shrink");
    const digest=await sha256(targets.map(t=>[t.server_id,t.host,t.status].join("|")).join("\n"));
    if(digest!==await readMeta(env,"inventory_hash")){
      const ms=Date.now();
      const stmts=targets.map(t=>env.DNS_DB.prepare(
        "INSERT INTO dns_targets(server_id,host,source_status,updated_at_ms,active) VALUES(?,?,?,?,1) ON CONFLICT(server_id) DO UPDATE SET host=excluded.host,source_status=excluded.source_status,updated_at_ms=excluded.updated_at_ms,active=1"
      ).bind(t.server_id,t.host,t.status,ms));
      stmts.push(env.DNS_DB.prepare("UPDATE dns_targets SET active=0 WHERE updated_at_ms < ? AND active=1").bind(ms));
      // D1 batches are atomic; skip a partial inventory on transient failures.
      await env.DNS_DB.batch(stmts);
      await putMeta(env,"inventory_hash",digest);
    }
    await putMeta(env,"last_inventory_success",Date.now());
    refreshed=true;
  }catch(e){fetchError=String(e?.message??e).slice(0,100);}
  if(fetchError) {
    try {
      const cached=await readCachedDnsTargets(env.DNS_DB);
      return {targets:cached,refreshed:false,fetchError,inventorySource:"cloudflare_dns_cache"};
    } catch(error) {
      console.warn("edge_dns_cache_unavailable",String(error?.message??error).slice(0,100));
    }
    try {
      const mirror = await readMirrorTargets(env.DNS_DB);
      return {targets:mirror,refreshed:false,fetchError,inventorySource:"cloudflare_http_mirror"};
    } catch(error) {
      console.warn("edge_dns_mirror_fallback_unavailable",String(error?.message??error).slice(0,100));
    }
  }
  const freshAt=Number(await readMeta(env,"last_inventory_success")||0);
  if(!freshAt||Date.now()-freshAt>6*3600000)
    throw new Error("Inventory unavailable; stale targets refused: "+(fetchError??"unknown"));
  const rows=await env.DNS_DB.prepare(
    "SELECT t.server_id,t.host,t.source_status,c.checked_at_ms,c.status AS last_status FROM dns_targets t LEFT JOIN dns_current c ON c.server_id=t.server_id WHERE t.active=1"
  ).all();
  return {targets:rows.results??[],refreshed,fetchError,inventorySource:refreshed?"signed_origin":"cached_origin"};
}
async function resolveA(domain,resolver){
  const started=Date.now();
  const url=resolver.base+"?name="+encodeURIComponent(domain)+"&type=A";
  try{
    const res=await fetch(url,{
      headers:{"accept":"application/dns-json"},
      signal:AbortSignal.timeout(DNS_TIMEOUT_MS),cache:"no-store",
    });
    if(!res.ok)throw new Error("transport");
    const answer=await res.json();
    const ips=(Array.isArray(answer.Answer)?answer.Answer:[])
      .filter(a=>a.type===1&&validIpv4(a.data)).map(a=>a.data).slice(0,8);
    const ttls=(Array.isArray(answer.Answer)?answer.Answer:[])
      .filter(a=>a.type===1&&Number.isInteger(a.TTL)&&a.TTL>=0)
      .map(a=>a.TTL);
    return {code:resolver.code,ok:answer.Status===0&&ips.length>0,ips,
      response_ms:Date.now()-started,ttl:ttls.length?Math.min(...ttls):null,
      error:answer.Status===3?"nxdomain":answer.Status!==0?"dns_rcode_"+answer.Status:ips.length?"": "no_a_record"};
  }catch(e){
    return {code:resolver.code,ok:false,ips:[],response_ms:Date.now()-started,ttl:null,
      error:"transport_error"};
  }
}
async function checkOne(target,thirdBudget){
  const host=hostName(target.host);
  const checked_at=new Date().toISOString();
  if(!host)return {server_id:target.server_id,host:target.host,checked_at,status:"unknown",resolvers:[
    {code:"cloudflare",ok:false,ips:[],response_ms:0,ttl:null,error:"invalid_host"},
    {code:"google",ok:false,ips:[],response_ms:0,ttl:null,error:"invalid_host"}]};
  const first=await Promise.all([resolveA(host,RESOLVERS[0]),resolveA(host,RESOLVERS[1])]);
  const maybeThird=target.source_status==="offline"||target.source_status==="unstable"
    ||first.some(x=>!x.ok);
  // Reserve third-resolver slots to stay inside Workers' subrequest budget.
  if(maybeThird&&thirdBudget.left>0){
    thirdBudget.left--;
    first.push(await resolveA(host,RESOLVERS[2]));
  }
  const successful=first.filter(x=>x.ok).length;
  const transport=first.filter(x=>x.error==="transport_error").length;
  let status=successful===first.length?"ok":successful===0?"down":"degraded";
  if(transport>=2||(successful===0&&first.length<3))status="unknown";
  return {server_id:target.server_id,host:target.host,checked_at,status,resolvers:first};
}
function chooseTargets(rows){
  const ordered=[...rows].sort((a,b)=>{
    const x=Number(a.checked_at_ms??0),y=Number(b.checked_at_ms??0);
    return x-y||String(a.server_id).localeCompare(String(b.server_id));
  });
  const priority=ordered.filter(x=>x.source_status==="offline"||x.source_status==="unstable"||x.last_status==="down")
    .slice(0,MAX_PRIORITY);
  const picked=new Set(priority.map(x=>x.server_id));
  // Reserve normal slots even when many domains remain offline.
  const normal=ordered.filter(x=>!picked.has(x.server_id)
    &&x.source_status!=="offline"&&x.source_status!=="unstable"&&x.last_status!=="down").slice(0,MAX_NORMAL);
  const alreadyPicked=new Set([...priority,...normal].map(x=>x.server_id));
  // Previously, low-priority OFFLINE records could be excluded forever.
  // Always fill spare slots with the oldest unchecked records, even if down.
  const remaining=ordered.filter(x=>!alreadyPicked.has(x.server_id))
    .slice(0,MAX_NORMAL-normal.length);
  return [...priority,...normal,...remaining];
}
async function gather(targets){
  const checked=new Array(targets.length);
  let cursor=0;
  const budget={left:MAX_THIRD};
  await Promise.all(Array.from({length:Math.min(5,targets.length)},async()=>{
    for(;;){
      const idx=cursor++;
      if(idx>=targets.length)break;
      checked[idx]=await checkOne(targets[idx],budget);
    }
  }));
  return checked;
}
async function keepResults(env,checks,sendReports=true){
  if (env.MONITOR_GUARD_MODE === "shadow") {
    for (const check of checks) await recordSample(env.DNS_DB, check.server_id, {
      kind: "dns", at: Date.parse(check.checked_at), proofs: check.resolvers.map(r => ({
        source: r.code, verdict: r.ok ? "ok" : r.error === "transport_error" || r.error === "invalid_host" ? "unknown" : "down"
      }))
    });
  }
  const stmts=[];
  for(const x of checks){
    const t=Date.parse(x.checked_at);
    const success=x.resolvers.filter(z=>z.ok).length;
    const times=x.resolvers.map(z=>z.response_ms).filter(v=>typeof v==="number");
    const average=times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null;
    const err=x.status==="unknown"?"inconclusive":null;
    stmts.push(env.DNS_DB.prepare(
      "INSERT INTO dns_current(server_id,checked_at_ms,status,successes,resolvers,avg_response_ms,error_kind) VALUES(?,?,?,?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET checked_at_ms=excluded.checked_at_ms,status=excluded.status,successes=excluded.successes,resolvers=excluded.resolvers,avg_response_ms=excluded.avg_response_ms,error_kind=excluded.error_kind"
    ).bind(x.server_id,t,x.status,success,x.resolvers.length,average,err));
    stmts.push(env.DNS_DB.prepare(
      "INSERT INTO dns_samples(server_id,checked_at_ms,status,successes,resolvers,avg_response_ms,error_kind) VALUES(?,?,?,?,?,?,?)"
    ).bind(x.server_id,t,x.status,success,x.resolvers.length,average,err));
  }
  // The authenticated report endpoint accepts at most 25 probes and applies
  // at most 20 in a pass. Split into 20-row durable chunks to avoid 400/429.
  // Never discard the batch if the app is briefly unavailable.
  if(sendReports) for(let i=0;i<checks.length;i+=20){
    const batch={checks:checks.slice(i,i+20)};
    stmts.push(env.DNS_DB.prepare(
      "INSERT INTO dns_pending_reports(id,payload,created_at_ms,attempts) VALUES(?,?,?,0)"
    ).bind(crypto.randomUUID(),JSON.stringify(batch),Date.now()));
  }
  await env.DNS_DB.batch(stmts);
}
async function flushReports(env){
  const {results}=await env.DNS_DB.prepare("SELECT id,payload,created_at_ms,attempts FROM dns_pending_reports ORDER BY created_at_ms LIMIT 4").all();
  let sent=0,failed=0;
  for(const item of results??[]){
    if(Date.now()-Number(item.created_at_ms)>3*60_000){
      await env.DNS_DB.prepare("DELETE FROM dns_pending_reports WHERE id=?").bind(item.id).run();
      continue;
    }
    try{
      const result=await api(env,"/api/public/edge-dns/report","POST",JSON.parse(item.payload));
      console.log("edge_dns_report_result",JSON.stringify({mode:result.mode,accepted:result.accepted,applied:result.applied,failed:result.failed,reasons:result.failureReasons||[]}).slice(0,350));
      console.log("edge_dns_delivery_response",JSON.stringify({mode:result.mode,accepted:result.accepted,applied:result.applied,failed:result.failed}));
      if(Number(result.failed||0)>0)throw new Error("origin_partial_apply_failure: "+(result.failureReasons||[]).join("; ").slice(0,250));
      await env.DNS_DB.prepare("DELETE FROM dns_pending_reports WHERE id=?").bind(item.id).run();
      sent+=(result.accepted??0);
      failed+=(result.failed??0);
    }catch(e){
      failed++;
      await env.DNS_DB.prepare("UPDATE dns_pending_reports SET attempts=attempts+1 WHERE id=?").bind(item.id).run();
      console.warn("edge_dns_delivery_failed",String(e?.message??e).slice(0,90));
    }
  }
  return {sent,failed};
}
async function runCycle(env){
  if(!env.DNS_DB||!(env.REGION_WORKER_SECRET||env.SIGNING_KEY_JWK))
    throw new Error("Missing D1 or DNS bridge secret");
  const {targets,refreshed,fetchError,inventorySource}=await inventory(env);
  if(!targets.length)throw new Error("No active DNS targets");
  const localOnly=!!fetchError;
  const selected=chooseTargets(targets);
  const results=await gather(selected);
  await keepResults(env,results,!localOnly);
  // Do not enqueue old results for delivery while the source is unavailable.
  if(localOnly) await env.DNS_DB.prepare(
    "DELETE FROM dns_pending_reports WHERE created_at_ms<?"
  ).bind(Date.now()-10*60_000).run();
  const delivered=localOnly?{sent:0,failed:0}:await flushReports(env);
  await putMeta(env,"last_cycle",JSON.stringify({timestamp:new Date().toISOString(),
    selected:results.length,healthy:results.filter(x=>x.status==="ok").length,
    degraded:results.filter(x=>x.status==="degraded").length,
    down:results.filter(x=>x.status==="down").length,
    unknown:results.filter(x=>x.status==="unknown").length,
    inventory:targets.length,inventory_refreshed:refreshed,inventory_source:inventorySource,
    local_only:localOnly,origin_error:fetchError,reported:delivered.sent,delivery_errors:delivered.failed}));
  if(Date.now()%1440000<60000)
    await env.DNS_DB.prepare("DELETE FROM dns_samples WHERE checked_at_ms < ?")
      .bind(Date.now()-5*86400000).run();
  return {processed:results.length,delivered};
}
const dnsWorker = {
  async scheduled(_event,env,ctx){
    ctx.waitUntil(runCycle(env)
      .then(v=>console.log("cloudflare_dns_cycle_ok",JSON.stringify(v)))
      .catch(e=>console.error("cloudflare_dns_cycle_failed",String(e?.message??e).slice(0,150))));
  },
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/dns-health"){
      const last=await readMeta(env,"last_cycle").catch(()=>null);
      const count=await env.DNS_DB.prepare("SELECT COUNT(*) AS total FROM dns_targets WHERE active=1").first().catch(()=>({total:0}));
      return Response.json({service:"streammonitor-dns-core",cloudflare_dns_engine:true,
        configured:!!env.DNS_DB&&!!(env.REGION_WORKER_SECRET||env.SIGNING_KEY_JWK),targets:Number(count?.total||0),
        last_cycle:last?JSON.parse(last):null},{headers:{"cache-control":"no-store"}});
    }
    return new Response("Not Found",{status:404});
  },
};


/**
 * Cloudflare Queue is the durable orchestrator for Telegram incident retries.
 * No Telegram chat ID, bot token, user message or personal data is stored in
 * Queue or D1. The existing server resolves recipients and performs sending
 * until credentials and sender are safely migrated independently.
 */
const TELEGRAM_DISPATCH_PATH="/api/public/edge-telegram/dispatch";
async function deliverTelegramTick(env,job){
  const payload=JSON.stringify({action:job.action,id:job.id,ts:Date.now()});
  const signed=await signatureHeaders(env,payload);
  const res=await fetch(ORIGIN+TELEGRAM_DISPATCH_PATH,{
    method:"POST",headers:{"content-type":"application/json",...signed},
    body:payload,cache:"no-store",signal:AbortSignal.timeout(45000)
  });
  if(!res.ok)throw new Error("telegram_bridge_http_"+res.status);
  const result=await res.json();
  if(!result||result.ok!==true)throw new Error("telegram_bridge_invalid_result");
  return result;
}
const telegramQueueWorker={
  scheduled(_event,env,ctx){
    if(!env.TELEGRAM_DB||!env.TELEGRAM_DELIVERY_QUEUE){
      console.warn("telegram_queue_not_configured");
      return;
    }
    ctx.waitUntil((async()=>{
      const flag=await env.TELEGRAM_DB.prepare("SELECT value FROM service_meta WHERE key='dispatch_enabled'").first();
      if(flag?.value!=="true")return;
      await env.TELEGRAM_DELIVERY_QUEUE.send({
        action:"run",id:crypto.randomUUID(),ts:Date.now()
      });
      console.log("telegram_queue_tick_enqueued");
    })().catch(err=>console.error("telegram_queue_enqueue_failed",String(err?.message||err).slice(0,130))));
  },
  async queue(batch,env){
    for(const msg of batch.messages){
      const task=msg.body;
      try{
        if (task?.action === "monitor-priority") {
          if (env.MONITOR_GUARD_MODE !== "shadow" || !Array.isArray(task.targets) || task.targets.length > 5
            || !Number.isFinite(task.ts) || Date.now() - task.ts > 90_000) {
            msg.ack();
            continue;
          }
          // Re-read authorized inventory: a queued host is never trusted.
          const allowed = await getTargets(env);
          const ids = new Set(task.targets.map(t => t.server_id));
          await reportHttpTargets(env, allowed.filter(t => ids.has(t.server_id)), !!allowed.isCloudflareMirror);
          msg.ack();
          continue;
        }
        if(!task||!["health","run"].includes(task.action)
          ||typeof task.id!=="string"||!/^[-a-f0-9]{36}$/i.test(task.id))
          throw new Error("telegram_queue_invalid_task");
        const result=await deliverTelegramTick(env,task);
        if(task.action==="run"&&result.skipped){
          msg.retry({delaySeconds:20});
          continue;
        }
        const completed=Date.now();
        await env.TELEGRAM_DB.prepare(
          "INSERT OR REPLACE INTO delivery_cycles(id,kind,scheduled_at_ms,completed_at_ms,status,attempted,delivered,delivery_errors,last_error) VALUES (?,?,?,?,?,?,?,?,?)"
        ).bind(task.id,task.action,Number(task.ts)||completed,completed,"completed",
          (result.attempted?.dns_offline||0)+(result.attempted?.dns_recovered||0)+(result.attempted?.server||0)+(result.attempted?.outbox||0),
          result.delivered||0,result.deliveryErrors||0,null).run();
        console.log("telegram_queue_dispatch_ok",JSON.stringify({
          mode:result.provider||result.mode,
          action:task.action,deliveryErrors:result.deliveryErrors||0,
          delivered:result.delivered||0
        }));
        msg.ack();
      }catch(err){
        const code=String(err?.message||"unknown").slice(0,100);
        console.error("telegram_queue_dispatch_failed",code);
        msg.retry({delaySeconds:30});
      }
    }
  }
};


/** Incremental, anonymized monitoring history mirror.
 * Authenticated read from the existing application. D1 stores no user
 * identifiers or hostnames, and never becomes an auth/payment database.
 */
async function syncMonitoringRollups(env){
  if(!env.METRICS_DB)return;
  const last=await env.METRICS_DB.prepare(
    "SELECT value FROM monitoring_sync_meta WHERE key='last_success_ms'"
  ).first();
  if(Number(last?.value||0)>0&&Date.now()-Number(last.value)<30*60_000)return;
  const signature=await signatureHeaders(env,"metrics-rollups-v1");
  const res=await fetch(ORIGIN+"/api/public/edge-metrics/rollups",{
    headers:signature,cache:"no-store",signal:AbortSignal.timeout(18000)
  });
  if(!res.ok)throw new Error("metrics_origin_http_"+res.status);
  const data=await res.json();
  if(data?.ok!==true||!Array.isArray(data.rollups)||data.rollups.length>15)
    throw new Error("metrics_invalid_source");
  const stamp=new Date().toISOString(),ms=Date.now();
  const stmts=[];
  for(const x of data.rollups){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(x.day))throw new Error("metrics_invalid_day");
    for(const field of ["servers","checks","ups","downs","degraded"]){
      if(!Number.isInteger(x[field])||x[field]<0)throw new Error("metrics_invalid_count");
    }
    stmts.push(env.METRICS_DB.prepare(
      "INSERT INTO monitoring_daily_rollups(day,servers,checks,ups,downs,degraded,avg_latency_ms,uptime_pct,captured_at,origin) VALUES(?,?,?,?,?,?,?,?,?,'signed-origin-incremental') ON CONFLICT(day) DO UPDATE SET servers=excluded.servers,checks=excluded.checks,ups=excluded.ups,downs=excluded.downs,degraded=excluded.degraded,avg_latency_ms=excluded.avg_latency_ms,uptime_pct=excluded.uptime_pct,captured_at=excluded.captured_at,origin=excluded.origin"
    ).bind(x.day,x.servers,x.checks,x.ups,x.downs,x.degraded,
      x.avg_latency_ms??null,x.uptime_pct??null,stamp));
  }
  if(!stmts.length)return;
  stmts.push(env.METRICS_DB.prepare(
    "INSERT INTO monitoring_sync_meta(key,value) VALUES('last_success_ms',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(String(ms)));
  await env.METRICS_DB.batch(stmts);
  console.log("cloudflare_monitoring_rollups_synced",JSON.stringify({days:data.rollups.length}));
}
const metricsWorker={
  scheduled(_event,env,ctx){
    if(!env.METRICS_DB)return;
    ctx.waitUntil(syncMonitoringRollups(env).catch(e=>
      console.warn("cloudflare_monitoring_rollups_sync_failed",String(e?.message||e).slice(0,150))));
  }
};

/** Enroll only a SHA-256 digest from a private Cloudflare service binding.
 * Plaintext BACKUP_BRIDGE_TOKEN is never returned, logged or copied to this
 * regional Worker. A signed request authenticates enrollment to the app.
 */
async function enrollmentControl(env){
  if(!env.BACKUP_ENROLLMENT||!env.DNS_DB)return;
  const read=async(key)=>{
    const row=await env.DNS_DB.prepare("SELECT value FROM dns_worker_meta WHERE key=?").bind(key).first();
    return row?.value??null;
  };
  const write=async(key,value)=>{
    await env.DNS_DB.prepare(
      "INSERT INTO dns_worker_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(key,String(value)).run();
  };
  if(await read("backup_enroll_requested")==="true"){
    const identity=await env.BACKUP_ENROLLMENT.getSecretFingerprint();
    if(!identity?.valid||!identity.sha256){
      await write("backup_enroll_status",identity?.configured?"secret_invalid_format":"secret_missing");
      await write("backup_enroll_requested","false");
      console.warn("backup_enrollment_invalid_format");
      return;
    }
    const payload=JSON.stringify({
      sha256:identity.sha256,timestamp:Date.now(),nonce:crypto.randomUUID()
    });
    const response=await fetch(ORIGIN+"/api/public/edge-backup/enroll",{
      method:"POST",headers:{"content-type":"application/json",...await signatureHeaders(env,payload)},
      body:payload,signal:AbortSignal.timeout(13000),cache:"no-store"
    });
    if(!response.ok){
      await write("backup_enroll_status","origin_http_"+response.status);
      console.warn("backup_enrollment_http_failure",response.status);
      return;
    }
    const confirmation=await response.json();
    if(confirmation.ok!==true)throw new Error("backup_enrollment_rejected");
    await write("backup_enroll_status","enrolled");
    await write("backup_enroll_requested","false");
    // Access test is read-only, no file transfer or secret exposure.
    const manifest=await env.BACKUP_ENROLLMENT.testManifest();
    await write("backup_manifest_status",manifest.ok?"verified_"+manifest.count:String(manifest.reason||"failed").slice(0,90));
    console.log("backup_enrollment_complete",JSON.stringify({manifestVerified:manifest.ok,count:manifest.count||0}));
  }
  if(await read("backup_integrity_requested")==="true"){
    await write("backup_integrity_requested","false");
    try{
      const result=await env.BACKUP_ENROLLMENT.verifyCanaryAndArchiveRange();
      await write("backup_integrity_status",result.ok?"canary_sha256_ok_archive_range_ok":String(result.reason||"failed").slice(0,120));
      console.log("backup_integrity_verified",JSON.stringify({ok:result.ok,canarySha256Match:result.canarySha256Match===true,archiveRangeSupported:result.archiveRangeSupported===true}));
    }catch(e){
      await write("backup_integrity_status","verification_failed");
      console.warn("backup_integrity_test_failed",String(e?.name||"error"));
    }
  }
  if(await read("backup_canary_requested")==="true"){
    await write("backup_canary_requested","false");
    const result=await env.BACKUP_ENROLLMENT.canaryCopySmall();
    await write("backup_canary_status",result.ok?("copied_"+(result.bytes||0)):String(result.reason||"error").slice(0,110));
    console.log("backup_canary_checked",JSON.stringify({ok:result.ok,bytes:result.bytes||0}));
  }
}
/** Internal Cloudflare service-binding fallback for new private backup Cron
 * propagation. Both entrypoints share the same D1 compare-and-set lease.
 * This invokes no public backup endpoint and exposes no secret.
 */
async function backupBulkControl(env){
  if(!env.BACKUP_ENROLLMENT||!env.DNS_DB)return;
  const configured=await env.DNS_DB.prepare(
    "SELECT value FROM dns_worker_meta WHERE key='backup_bulk_copy_requested'"
  ).first();
  if(configured?.value!=="true")return;
  const outcome=await env.BACKUP_ENROLLMENT.copyBackupBatch();
  console.log("backup_bulk_service_batch",JSON.stringify({mode:outcome.mode,source:outcome.source||null}));
  if(outcome.mode==="complete_and_disabled"){
    await env.DNS_DB.prepare(
      "UPDATE dns_worker_meta SET value='false' WHERE key='backup_bulk_copy_requested'"
    ).run();
  }
}
/** Verify the completed archive against a local-computer SHA256 by an
 * independent Worker. No archive or token is exposed to this Worker.
 */
async function backupArchiveVerifyControl(env){
  if(!env.BACKUP_VERIFY||!env.DNS_DB)return;
  const flag=await env.DNS_DB.prepare(
    "SELECT value FROM dns_worker_meta WHERE key='backup_archive_verify_requested'"
  ).first();
  if(flag?.value!=="true")return;
  const result=await env.BACKUP_VERIFY.verifyArchive();
  if(result.reason==="archive_not_yet_copied")return;
  const state=result.matched?"verified_sha256":"verification_failed";
  await env.DNS_DB.prepare(
    "INSERT INTO dns_worker_meta(key,value) VALUES('backup_archive_verify_status',?) "+
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(state).run();
  await env.DNS_DB.prepare(
    "UPDATE dns_worker_meta SET value='false' WHERE key='backup_archive_verify_requested'"
  ).run();
  console.log("backup_archive_verification_completed",JSON.stringify({sha256Matched:result.matched===true,bytes:result.bytes||null,reason:result.reason||null}));
}
async function backupRecentArchiveVerifyControl(env){
  if(!env.BACKUP_VERIFY||!env.DNS_DB)return;
  const requested=await env.DNS_DB.prepare(
    "SELECT value FROM dns_worker_meta WHERE key='backup_recent_archive_verify_requested'"
  ).first();
  if(requested?.value!=="true")return;
  const result=await env.BACKUP_VERIFY.verifyRecentArchive();
  if(result?.reason==="recent_archive_not_available")return;
  const status=result?.ok===true
    ?"r2_full_sha256_computed_source_comparison_pending"
    :"r2_archive_read_failed";
  await env.DNS_DB.batch([
    env.DNS_DB.prepare(
      "INSERT INTO dns_worker_meta(key,value) VALUES('backup_recent_archive_verify_status',?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(status),
    env.DNS_DB.prepare(
      "INSERT INTO dns_worker_meta(key,value) VALUES('backup_recent_archive_verify_requested','false') "+
      "ON CONFLICT(key) DO UPDATE SET value='false'"
    )
  ]);
  console.log("backup_recent_archive_stream_finished",
    JSON.stringify({r2_read_ok:result?.ok===true,bytes:result?.bytes??null}));
}

export default {
  scheduled(event,env,ctx){
    regionalWorker.scheduled(event,env,ctx);
    dnsWorker.scheduled(event,env,ctx);
    telegramQueueWorker.scheduled(event,env,ctx);
    metricsWorker.scheduled(event,env,ctx);
    if(env.BACKUP_ENROLLMENT)ctx.waitUntil(enrollmentControl(env).catch(e=>console.warn("backup_enroll_control_failed",String(e?.message||e).slice(0,130))));
    if(env.BACKUP_ENROLLMENT)ctx.waitUntil(backupBulkControl(env).catch(e=>console.error("backup_bulk_service_failed",String(e?.message||e).slice(0,130))));
    if(env.BACKUP_VERIFY)ctx.waitUntil(backupArchiveVerifyControl(env).catch(e=>console.error("backup_sha256_check_failed",String(e?.name||"error"))));
    if(env.BACKUP_VERIFY)ctx.waitUntil(backupRecentArchiveVerifyControl(env).catch(e=>console.error("backup_recent_sha256_check_failed",String(e?.name||"error"))));
  },
  queue(batch,env,ctx){
    return telegramQueueWorker.queue(batch,env,ctx);
  },
  fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    return path==="/dns-health"?dnsWorker.fetch(request,env,ctx):regionalWorker.fetch(request,env,ctx);
  }
};
