import { pullAuthorizedFeed } from "./private-source-adapter.mjs";

/**
 * Stream Monitor - Radar de Bloqueios, Cloudflare-only backend (private pilot).
 * NO public/reseller endpoints, NO notification dispatch, NO credential transfers.
 * All source data and provenance stay in private D1. No customer DNS list is sent out.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
const goodHost=s=>typeof s==="string"&&s.length>=3&&s.length<=253
  &&/^[a-z0-9.-]+$/.test(s.toLowerCase())&&!s.includes("..");
const mapRows=(rows,key)=>{const out=new Map();for(const r of rows){const k=r[key];if(!out.has(k))out.set(k,[]);out.get(k).push(r)}return out};
const asHost=raw=>String(raw||"").trim().toLowerCase().replace(/\.$/,"").replace(/:\d{1,5}$/,"");
async function readCurrent(env,now){
  const q=async(db,sql,values=[])=>{const r=await db.prepare(sql).bind(...values).all();return r.results||[]};
  const [targets,owners,dns,http,evidence,prior]=await Promise.all([
    q(env.DNS_DB,"SELECT server_id,host FROM edge_target_mirror WHERE active=1 ORDER BY server_id LIMIT 500"),
    q(env.MIGRATION_DB,"SELECT server_id,owner_id,host FROM migration_servers_stage WHERE source_snapshot_id='shadow_2026-11-20_22_servers' AND monitoring_paused=0 LIMIT 800"),
    q(env.DNS_DB,"SELECT server_id,status,successes,resolvers,checked_at_ms FROM (SELECT server_id,status,successes,resolvers,checked_at_ms,ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY checked_at_ms DESC) rank FROM dns_samples WHERE checked_at_ms>?) WHERE rank<=4",[now-30*60000]),
    q(env.DNS_DB,"SELECT server_id,status,region_code,checked_at_ms FROM (SELECT server_id,status,region_code,checked_at_ms,ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY checked_at_ms DESC) rank FROM edge_http_samples WHERE checked_at_ms>?) WHERE rank<=4",[now-30*60000]),
    q(env.DNS_DB,"SELECT source_id,host,evidence_kind,network_id,evidence_verdict,verification,observed_ms,effective_ms,expires_ms,record_json FROM radar_evidence WHERE verification='verified' AND (expires_ms IS NULL OR expires_ms>?) ORDER BY observed_ms DESC LIMIT 1500",[now]),
    q(env.DNS_DB,"SELECT server_id,status,first_identified_ms,last_changed_ms,correlation_id FROM radar_states LIMIT 600")
  ]);
  return {targets,owners:new Map(owners.map(x=>[x.server_id,x])),dns:mapRows(dns,"server_id"),http:mapRows(http,"server_id"),evidence:mapRows(evidence,"host"),prior:new Map(prior.map(x=>[x.server_id,x]))};
}
export function classify(dns,http,ev,old,now){
  const result={dns_ok:0,dns_partial:0,dns_down:0,http_up:0,http_down:0,regions:[]};
  const regions=new Set();
  for(const x of dns){
    const successes=Number(x.successes),resolvers=Number(x.resolvers);
    if(x.status==="ok"&&successes>=2&&resolvers>=2)result.dns_ok++;
    else if(resolvers>=2&&successes>0&&successes<resolvers)result.dns_partial++;
    else if(x.status==="down"||successes===0)result.dns_down++;
  }
  for(const x of http){
    if(x.status==="up")result.http_up++;
    if(x.status==="down")result.http_down++;
    if(x.region_code)regions.add(x.region_code);
  }
  result.regions=[...regions].sort().slice(0,8);
  const good=ev.filter(x=>x.verification==="verified"&&now-x.observed_ms<48*3600000);
  const blocked=good.filter(x=>x.evidence_kind==="network_block"&&x.evidence_verdict==="blocked"&&x.network_id);
  const reachable=good.filter(x=>x.evidence_kind==="network_reachable"&&x.evidence_verdict==="reachable"&&x.network_id);
  const blockedNetworks=new Set(blocked.map(x=>x.network_id));
  const sources=new Set(blocked.map(x=>x.source_id));
  const hasDifferentReachableNetwork=reachable.some(x=>!blockedNetworks.has(x.network_id));
  const repeated=blocked.length>=2&&Math.max(...blocked.map(x=>x.observed_ms))-Math.min(...blocked.map(x=>x.observed_ms))>=300000;
  const recoveredNetworks=new Set(reachable.map(x=>x.network_id));
  const signatures=blocked.filter(x=>{
    try{return ["dns_intercept","explicit_block_page","isp_tls_reset"].includes(JSON.parse(x.record_json).diagnostic_signature)}
    catch{return false}
  });
  const confirmed=blockedNetworks.size>=2&&sources.size>=2&&hasDifferentReachableNetwork&&repeated&&signatures.length>=2;
  const future=ev.some(x=>x.verification==="verified"&&x.evidence_verdict==="scheduled"&&
    ["future_restriction","documented_restriction"].includes(x.evidence_kind)&&x.effective_ms>now&&
    x.effective_ms<now+366*86400000);
  const clean=result.dns_ok>=2&&result.dns_partial===0&&result.dns_down===0&&result.http_up>=1&&result.http_down===0;
  if(confirmed)return {status:"confirmed",confidence:"high",reason:"independent_network_evidence",tech:result};
  if(future)return {status:"risk",confidence:"medium",reason:"verified_future_record",tech:result};
  if((result.dns_partial>=2&&result.http_up>=1)||(result.dns_down>=2&&result.http_up>=2))
    return {status:"possible",confidence:"medium",reason:"repeated_network_disagreement",tech:result};
  // Only a previously confirmed restriction can become 'normalized'.
  if(clean&&old?.status==="confirmed"&&blocked.length===0&&recoveredNetworks.size>=2)
    return {status:"normalized",confidence:"medium",reason:"previous_restriction_cleared",tech:result};
  if(old?.status==="confirmed")
    return {status:"unknown",confidence:"low",reason:"recovery_not_yet_verified",tech:result};
  if(clean&&old?.status==="normalized")
    return {status:"normalized",confidence:"medium",reason:"recovery_monitoring",tech:result};
  if(clean)return {status:"normal",confidence:"medium",reason:"reachable_on_tested_networks",tech:result};
  // All checks failed => origin outage or unknown cause. NOT automatically blocked.
  return {status:"unknown",confidence:"low",reason:"insufficient_evidence",tech:result};
}
async function scan(env){
 const db=env.DNS_DB,now=Date.now();
 if(!db||!env.MIGRATION_DB)return;
 const flag=await db.prepare("SELECT value FROM radar_control WHERE key='radar_last_evaluation_ms'").first();
 if(now-Number(flag?.value||0)<240000)return;
 const runId=crypto.randomUUID();
 await db.prepare("INSERT INTO radar_runs(run_id,kind,started_ms) VALUES(?,'classification',?)").bind(runId,now).run();
 try{
  const data=await readCurrent(env,now);
  const statements=[];
  let processed=0,changes=0,unowned=0;
  for(const target of data.targets){
    if(!UUID.test(target.server_id))continue;
    const owner=data.owners.get(target.server_id);
    const hostname=asHost(target.host);
    if(!owner||!goodHost(hostname)||asHost(owner.host)!==hostname){unowned++;continue;}
    const prior=data.prior.get(target.server_id);
    const evaluated=classify(data.dns.get(target.server_id)||[],data.http.get(target.server_id)||[],
      data.evidence.get(hostname)||[],prior,now);
    const technical=JSON.stringify(evaluated.tech);
    const changed=!!prior&&prior.status!==evaluated.status;
    const transitionId=changed?crypto.randomUUID():prior?.correlation_id||crypto.randomUUID();
    statements.push(db.prepare("INSERT INTO radar_states(server_id,owner_id,host,status,reason_code,confidence,first_identified_ms,last_changed_ms,last_checked_ms,dns_ok,dns_partial,dns_down,http_up,http_down,technical_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(server_id) DO UPDATE SET owner_id=excluded.owner_id,host=excluded.host,status=excluded.status,reason_code=excluded.reason_code,confidence=excluded.confidence,last_changed_ms=excluded.last_changed_ms,last_checked_ms=excluded.last_checked_ms,dns_ok=excluded.dns_ok,dns_partial=excluded.dns_partial,dns_down=excluded.dns_down,http_up=excluded.http_up,http_down=excluded.http_down,technical_json=excluded.technical_json,correlation_id=excluded.correlation_id")
      .bind(target.server_id,owner.owner_id,hostname,evaluated.status,evaluated.reason,evaluated.confidence,
        prior?.first_identified_ms||now,changed?now:prior?.last_changed_ms||now,now,
        evaluated.tech.dns_ok,evaluated.tech.dns_partial,evaluated.tech.dns_down,
        evaluated.tech.http_up,evaluated.tech.http_down,technical,transitionId));
    if(changed){
      changes++;
      statements.push(db.prepare("INSERT INTO radar_transitions(id,server_id,owner_id,from_status,to_status,reason_code,occurred_ms,technical_json) VALUES(?,?,?,?,?,?,?,?)")
        .bind(transitionId,target.server_id,owner.owner_id,prior.status,evaluated.status,evaluated.reason,now,technical));
      if(["possible","confirmed","risk","normalized"].includes(evaluated.status))
        statements.push(db.prepare("INSERT OR IGNORE INTO radar_outbox(id,transition_id,server_id,owner_id,status,enqueue_ms) VALUES(?,?,?,?,?,?)")
          .bind(crypto.randomUUID(),transitionId,target.server_id,owner.owner_id,evaluated.status,now));
    }
    processed++;
  }
  for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));
  await db.batch([
   db.prepare("INSERT INTO radar_control(key,value,updated_ms) VALUES('radar_last_evaluation_ms',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(String(now),now),
   db.prepare("UPDATE radar_runs SET finished_ms=?,targets_seen=?,states_changed=?,error_code=? WHERE run_id=?")
     .bind(Date.now(),processed,changes,unowned?"ownership_snapshot_incomplete":null,runId)
  ]);
 }catch{
  await db.prepare("UPDATE radar_runs SET finished_ms=?,error_code='scan_failed' WHERE run_id=?")
    .bind(Date.now(),runId).run().catch(()=>{});
 }
}
export default {
 async scheduled(event,env,ctx){
  if(event?.cron==="0 */6 * * *"){
    ctx.waitUntil(pullAuthorizedFeed(env).catch(()=>{}));
    return;
  }
  ctx.waitUntil(scan(env));
 },
 async fetch(){return new Response("Not Found",{status:404,headers:{"cache-control":"no-store"}})}
};
