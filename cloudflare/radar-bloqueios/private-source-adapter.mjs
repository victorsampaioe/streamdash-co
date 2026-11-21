/**
 * Private authorized-feed adapter for Stream Monitor Radar.
 *
 * No provider identity, URL, API token, response body or private DNS inventory
 * is exposed in reseller APIs, UI, Telegram or public logs.
 * Disabled until the operator has documented authorized access.
 *
 * Expected supported feed: GET /api/version -> integer Unix timestamp;
 * GET /domains/all -> one domain per line. All matching happens locally in D1.
 */
const hostOf=v=>String(v||"").trim().toLowerCase().replace(/\.$/,"").replace(/:\d{1,5}$/,"");
const safeHost=h=>h.length>=3&&h.length<=253&&/^[a-z0-9.-]+$/.test(h)&&!h.includes("..");
export async function pullAuthorizedFeed(env){
 const db=env.DNS_DB;
 if(!db||env.RADAR_SOURCE_APPROVED!=="true"||
   !env.RADAR_FEED_API_BASE||!env.RADAR_FEED_ALLOWED_HOST)
   return {skipped:"authorization_not_configured"};
 const approved=await db.prepare(
   "SELECT id FROM radar_sources WHERE approved=1 AND enabled=1 ORDER BY created_ms DESC LIMIT 1"
 ).first();
 if(!approved)return {skipped:"no_approved_source"};
 const base=new URL(env.RADAR_FEED_API_BASE);
 if(base.protocol!=="https:"||base.hostname!==env.RADAR_FEED_ALLOWED_HOST
   ||base.username||base.password||base.port||base.search||base.hash)
   return {skipped:"invalid_private_configuration"};
 const path=p=>new URL(p,base.origin);
 const headers={accept:"text/plain"};
 if(env.RADAR_FEED_BEARER)headers.authorization="Bearer "+env.RADAR_FEED_BEARER;
 const versionResponse=await fetch(path("/api/version"),{
   headers,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)
 });
 if(!versionResponse.ok)return {skipped:"version_unavailable"};
 const version=(await versionResponse.text()).trim();
 if(!/^\d{9,12}$/.test(version))return {skipped:"invalid_version"};
 const last=await db.prepare("SELECT value FROM radar_control WHERE key='radar_source_version'").first();
 if(last?.value===version)return {ok:true,unchanged:true};
 const domainResponse=await fetch(path("/domains/all"),{
   headers,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(25000)
 });
 if(!domainResponse.ok||Number(domainResponse.headers.get("content-length")||0)>12000000)
   return {skipped:"feed_unavailable"};
 const raw=await domainResponse.text();
 if(raw.length>12000000)return {skipped:"feed_too_large"};
 const lines=raw.split(/\r?\n/);
 if(lines.length<1||lines.length>260000)return {skipped:"invalid_feed_size"};
 const targets=(await db.prepare(
   "SELECT DISTINCT host FROM edge_target_mirror WHERE active=1 LIMIT 1200"
 ).all()).results||[];
 const allowed=new Set(targets.map(x=>hostOf(x.host)).filter(safeHost));
 const found=new Set();
 let valid=0;
 for(const line of lines){
   const host=hostOf(line);
   if(!host||line.trim().startsWith("#"))continue;
   if(!safeHost(host))return {skipped:"feed_invalid_record"};
   valid++;
   if(allowed.has(host))found.add(host);
 }
 if(valid===0)return {skipped:"feed_empty"};
 // Record candidate matches without assuming a successful local network block.
 // A source listing by itself is not enough to claim confirmed restriction.
 const at=Date.now(),statements=[];
 for(const host of found){
   statements.push(db.prepare(
     "INSERT INTO radar_evidence(id,source_id,source_record_key,host,evidence_kind,network_id,"+
     "evidence_verdict,verification,observed_ms,effective_ms,expires_ms,sha256,source_url,record_json,created_ms) "+
     "VALUES(?,?,?,?, 'documented_restriction',NULL,'inconclusive','unverified',?,NULL,NULL,NULL,?,?,?) "+
     "ON CONFLICT(source_id,source_record_key) DO UPDATE SET observed_ms=excluded.observed_ms,"+
     "expires_ms=NULL,record_json=excluded.record_json"
   ).bind(crypto.randomUUID(),approved.id,host,host,at,
      path("/domains/all").toString(),JSON.stringify({version,kind:"candidate_match"}),at));
 }
 for(let i=0;i<statements.length;i+=30)await db.batch(statements.slice(i,i+30));
 // Only after a complete successful fetch may stale candidate entries expire.
 await db.prepare(
   "UPDATE radar_evidence SET expires_ms=? WHERE source_id=? AND observed_ms<? "+
   "AND evidence_kind='documented_restriction' AND evidence_verdict='inconclusive'"
 ).bind(at,approved.id,at).run();
 await db.prepare(
   "INSERT INTO radar_control(key,value,updated_ms) VALUES('radar_source_version',?,?) "+
   "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms"
 ).bind(version,at).run();
 await db.prepare("UPDATE radar_sources SET last_fetch_ms=?,modified_ms=? WHERE id=?")
   .bind(at,at,approved.id).run();
 return {ok:true,matched:found.size,storedAs:"unverified_candidates"};
}
