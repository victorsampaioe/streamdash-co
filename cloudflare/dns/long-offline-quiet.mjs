/**
 * Cloudflare DNS long-offline query backoff.
 * Five *continuous* days of confirmed DNS failure -> stop frequent DNS/HTTP
 * probes, keep registration and audit trail, perform a daily recovery probe.
 * No Telegram, billing, account status or customer data is modified.
 */
export const FIVE_DAYS_MS = 5 * 86400000;
const DAILY_MS = 86400000;
const FRESH_MS = 3 * 3600000;
const RECONFIRM_MS = 5 * 60000;
const RECHECK_ERROR_MS = 2 * 3600000;
const validStatus = v => ["offline","online","unstable","unknown"].includes(v);
export const hasReliableDown = (t,now) =>
 t?.source_status==="offline" && t?.last_status==="down" &&
 Number.isSafeInteger(Number(t?.checked_at_ms)) &&
 Number(t.checked_at_ms)>now-FRESH_MS && Number(t.checked_at_ms)<=now+60000 &&
 Number(t.successes)===0 && Number(t.resolvers)>=2;
export const isQuiet = row => Number(row?.quieted_at_ms)>0;
const cleanHost = h => String(h||"").trim().toLowerCase();
async function allRows(db) {
 const [p]=await Promise.all([
  db.prepare("SELECT server_id,host,offline_since_ms,quieted_at_ms,next_probe_at_ms,last_probe_at_ms,success_streak FROM dns_quiet_policy").all()
 ]);
 return new Map((p.results||[]).map(r=>[r.server_id,r]));
}
async function logEvent(db,id,event,now,source){
 await db.prepare("INSERT INTO dns_quiet_events(server_id,event,occurred_ms,source) VALUES(?,?,?,?)")
  .bind(id,event,now,source).run();
}
export async function evaluateQuietTargets(db,targets,now=Date.now()){
 if(!db || !Array.isArray(targets))return {normal:targets||[],due:[],quiet:0};
 const stored=await allRows(db);
 const normal=[],due=[];
 let quietCount=0;
 const work=[];
 for(const t of targets){
  if(!t?.server_id || !t?.host)continue;
  const previous=stored.get(t.server_id);
  const host=cleanHost(t.host);
  if(previous && cleanHost(previous.host)!==host){
   work.push(db.prepare("DELETE FROM dns_quiet_policy WHERE server_id=?").bind(t.server_id));
   // Do not carry the old host's five-day failure to the new hostname.
   normal.push(t);
   continue;
  }
  if(!validStatus(t.source_status) || t.source_status!=="offline"){
   if(previous)work.push(db.prepare("DELETE FROM dns_quiet_policy WHERE server_id=?").bind(t.server_id));
   normal.push(t);continue;
  }
  // A verified successful DNS response cancels a *watching* row. A quiet row
  // requires two successful spaced probes (handled by recordQuietProbes).
  if(t.last_status==="ok" && !isQuiet(previous)){
   if(previous)work.push(db.prepare("DELETE FROM dns_quiet_policy WHERE server_id=?").bind(t.server_id));
   normal.push(t);continue;
  }
  if(!previous){
   if(hasReliableDown(t,now))
    work.push(db.prepare("INSERT OR IGNORE INTO dns_quiet_policy(server_id,host,offline_since_ms,updated_ms) VALUES(?,?,?,?)")
      .bind(t.server_id,host,now,now));
   normal.push(t);continue;
  }
  if(!isQuiet(previous)&&hasReliableDown(t,now) &&
     now-Number(previous.offline_since_ms)>=FIVE_DAYS_MS){
   work.push(db.prepare("UPDATE dns_quiet_policy SET quieted_at_ms=?,next_probe_at_ms=?,updated_ms=? WHERE server_id=? AND quieted_at_ms IS NULL")
    .bind(now,now+RECHECK_ERROR_MS,now,t.server_id));
   quietCount++;
   // Due probe will be executed in a later cycle; don't probe at promotion.
   continue;
  }
  if(isQuiet(previous)){
   quietCount++;
   if(Number(previous.next_probe_at_ms||0)<=now)due.push(t);
   continue;
  }
  normal.push(t);
 }
 if(work.length)for(let i=0;i<work.length;i+=30)await db.batch(work.slice(i,i+30));
 return {normal,due:due.slice(0,2),quiet:quietCount,watching:stored.size-quietCount};
}
export async function filterQuietHttpTargets(db,targets){
 if(!db||!Array.isArray(targets)||!targets.length)return targets||[];
 const rows=await db.prepare("SELECT server_id FROM dns_quiet_policy WHERE quieted_at_ms IS NOT NULL").all();
 const quiet=new Set((rows.results||[]).map(x=>x.server_id));
 return targets.filter(t=>!quiet.has(t.server_id));
}
export async function recordQuietProbes(db,checks,now=Date.now()){
 if(!db||!Array.isArray(checks)||!checks.length)return {released:0,quietChecked:0};
 const ids=checks.map(x=>x.server_id).filter(Boolean);
 if(!ids.length)return {released:0,quietChecked:0};
 const records=await allRows(db);
 let released=0,quietChecked=0;
 const work=[];
 for(const x of checks){
   const row=records.get(x.server_id);
   if(!isQuiet(row))continue;
   quietChecked++;
   const observed=Date.parse(x.checked_at);
   if(!Number.isFinite(observed)||Math.abs(observed-now)>120000)continue;
   const proofs=Array.isArray(x.resolvers)?x.resolvers:[];
   const successes=proofs.filter(r=>r.ok===true).length;
   const good=x.status==="ok"&&successes>=2;
   if(good){
    const previousAt=Number(row.last_probe_at_ms||0);
    const count=Number(row.success_streak||0);
    if(count>=1 && now-previousAt>=RECONFIRM_MS){
      work.push(db.prepare("DELETE FROM dns_quiet_policy WHERE server_id=?").bind(x.server_id));
      released++;
      continue;
    }
    work.push(db.prepare("UPDATE dns_quiet_policy SET last_probe_at_ms=?,next_probe_at_ms=?,success_streak=?,updated_ms=? WHERE server_id=?")
      .bind(now,now+RECONFIRM_MS,1,now,x.server_id));
   }else{
    const next=x.status==="unknown"?RECHECK_ERROR_MS:DAILY_MS;
    work.push(db.prepare("UPDATE dns_quiet_policy SET last_probe_at_ms=?,next_probe_at_ms=?,success_streak=0,updated_ms=? WHERE server_id=?")
      .bind(now,now+next,now,x.server_id));
   }
 }
 if(work.length)for(let i=0;i<work.length;i+=30)await db.batch(work.slice(i,i+30));
 return {released,quietChecked};
}
