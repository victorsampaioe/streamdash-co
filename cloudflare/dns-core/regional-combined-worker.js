/**
 * Stream Monitor: independent, low-cost Cloudflare edge probe.
 * Cloudflare cron does NOT guarantee physical São Paulo placement.
 * Independent probe with ECDSA signature; no IPTV credentials in this runtime.
 *
 * Env: ENDPOINT_BASE, REGION_CODE and one Cloudflare secret binding:
 * REGION_WORKER_SECRET (same existing Lovable environment value) OR
 * SIGNING_KEY_JWK (private ECDSA key; public JWK in Lovable app_settings).
 * Cron: every minute; limit 20 targets, 1 targets call, 1 report call.
 */
const MAX_TARGETS = 20;
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
  const message = "targets";
  return (await jsonOrFail(await fetch(`${env.ENDPOINT_BASE}/api/public/regions/targets`, {
    headers: await signatureHeaders(env, message),
    signal: AbortSignal.timeout(TIMEOUT),
  }))).targets ?? [];
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
    status = "down";
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


async function tick(env) {
  config(env);
  const all = await getTargets(env);
  if (!Array.isArray(all)) throw new Error("Invalid target list");
  if (all.length === 0) {
    return { ok: true, targets: 0, checked: 0, reported: 0 };
  }
  const totalSlots = Math.ceil(all.length / MAX_TARGETS);
  const slot = Math.floor(Date.now() / 60000) % totalSlots;
  const targets = all.slice(slot * MAX_TARGETS, (slot + 1) * MAX_TARGETS);
  const reports = await pool(targets, env.REGION_CODE);
  const body = JSON.stringify({ reports });
  const authHeaders = await signatureHeaders(env, body);
  const reply = await jsonOrFail(await fetch(`${env.ENDPOINT_BASE}/api/public/regions/report`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body, signal: AbortSignal.timeout(15000),
  }));
  return { ok: true, targets: all.length, checked: targets.length, reported: reply.inserted ?? 0, slot: slot + 1, totalSlots };
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
const MAX_NORMAL=15,MAX_PRIORITY=4,MAX_THIRD=6;
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
    const digest=await sha256(targets.map(t=>[t.server_id,t.host,t.status].join("|")).join("\n"));
    if(digest!==await readMeta(env,"inventory_hash")){
      const ms=Date.now();
      const stmts=targets.map(t=>env.DNS_DB.prepare(
        "INSERT INTO dns_targets(server_id,host,source_status,updated_at_ms) VALUES(?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET host=excluded.host,source_status=excluded.source_status,updated_at_ms=excluded.updated_at_ms"
      ).bind(t.server_id,t.host,t.status,ms));
      stmts.push(env.DNS_DB.prepare("DELETE FROM dns_targets WHERE updated_at_ms < ?").bind(ms));
      // D1 batches are atomic; skip a partial inventory on transient failures.
      await env.DNS_DB.batch(stmts);
      await putMeta(env,"inventory_hash",digest);
    }
    await putMeta(env,"last_inventory_success",Date.now());
    refreshed=true;
  }catch(e){fetchError=String(e?.message??e).slice(0,100);}
  const freshAt=Number(await readMeta(env,"last_inventory_success")||0);
  if(!freshAt||Date.now()-freshAt>6*3600000)
    throw new Error("Inventory unavailable; stale targets refused: "+(fetchError??"unknown"));
  const rows=await env.DNS_DB.prepare(
    "SELECT t.server_id,t.host,t.source_status,c.checked_at_ms,c.status AS last_status FROM dns_targets t LEFT JOIN dns_current c ON c.server_id=t.server_id"
  ).all();
  return {targets:rows.results??[],refreshed,fetchError};
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
    &&x.source_status!=="offline"&&x.source_status!=="unstable"&&x.last_status!=="down");
  return [...priority,...normal.slice(0,MAX_NORMAL)];
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
async function keepResults(env,checks){
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
  // Check results survive even when the Lovable REST endpoint is temporarily down.
  const batch={checks};
  stmts.push(env.DNS_DB.prepare(
    "INSERT INTO dns_pending_reports(id,payload,created_at_ms,attempts) VALUES(?,?,?,0)"
  ).bind(crypto.randomUUID(),JSON.stringify(batch),Date.now()));
  await env.DNS_DB.batch(stmts);
}
async function flushReports(env){
  const {results}=await env.DNS_DB.prepare("SELECT id,payload,created_at_ms,attempts FROM dns_pending_reports ORDER BY created_at_ms LIMIT 2").all();
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
  const {targets,refreshed,fetchError}=await inventory(env);
  if(!targets.length)throw new Error("No active DNS targets");
  const selected=chooseTargets(targets);
  const results=await gather(selected);
  await keepResults(env,results);
  const delivered=await flushReports(env);
  await putMeta(env,"last_cycle",JSON.stringify({timestamp:new Date().toISOString(),
    selected:results.length,healthy:results.filter(x=>x.status==="ok").length,
    degraded:results.filter(x=>x.status==="degraded").length,
    down:results.filter(x=>x.status==="down").length,
    unknown:results.filter(x=>x.status==="unknown").length,
    inventory:targets.length,inventory_refreshed:refreshed,
    origin_error:fetchError,reported:delivered.sent,delivery_errors:delivered.failed}));
  if(Date.now()%1440000<60000)
    await env.DNS_DB.prepare("DELETE FROM dns_samples WHERE checked_at_ms < ?")
      .bind(Date.now()-7*86400000).run();
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
      const count=await env.DNS_DB.prepare("SELECT COUNT(*) AS total FROM dns_targets").first().catch(()=>({total:0}));
      return Response.json({service:"streammonitor-dns-core",cloudflare_dns_engine:true,
        configured:!!env.DNS_DB&&!!(env.REGION_WORKER_SECRET||env.SIGNING_KEY_JWK),targets:Number(count?.total||0),
        last_cycle:last?JSON.parse(last):null},{headers:{"cache-control":"no-store"}});
    }
    return new Response("Not Found",{status:404});
  },
};

export default {
  scheduled(event,env,ctx){
    regionalWorker.scheduled(event,env,ctx);
    dnsWorker.scheduled(event,env,ctx);
  },
  fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    return path==="/dns-health"?dnsWorker.fetch(request,env,ctx):regionalWorker.fetch(request,env,ctx);
  }
};
