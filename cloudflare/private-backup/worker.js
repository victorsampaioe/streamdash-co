import {WorkerEntrypoint} from "cloudflare:workers";
/**
 * Stream Monitor: one-way, private Supabase Storage -> Cloudflare R2 backup.
 * No public routes, no user data in logs, no deletion at source.
 * Runs in incremental safe batches; progress persists in D1.
 */
const ORIGIN="https://streammonitor.site";
const PART_BYTES=8*1024*1024;
const MAX_PARTS_PER_TICK=4;
const SMALL_LIMIT=7*1024*1024;

function auth(env){return {"x-sm-backup-key":env.BACKUP_BRIDGE_TOKEN};}
async function callOrigin(env,path,payload){
  const opts={
    method:payload?"POST":"GET",
    headers:{...auth(env),...(payload?{"content-type":"application/json"}:{})},
    cache:"no-store",signal:AbortSignal.timeout(18000),
  };
  if(payload)opts.body=JSON.stringify(payload);
  const res=await fetch(ORIGIN+path,opts);
  if(!res.ok)throw new Error("backup_origin_http_"+res.status);
  const data=await res.json();
  if(data?.ok!==true)throw new Error("backup_origin_invalid");
  return data;
}
async function sha(text){
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function recordInventory(env){
  const manifest=await callOrigin(env,"/api/public/edge-backup/manifest");
  if(!Array.isArray(manifest.files)||manifest.files.length>250)
    throw new Error("backup_manifest_invalid");
  let added=0;
  const now=new Date().toISOString();
  for(const file of manifest.files){
    if(!["database_export_15_11_26","promo-arts"].includes(file.bucket))continue;
    if(!file.path||typeof file.path!=="string"||file.path.length>1024
      ||!Number.isSafeInteger(file.size)||file.size<=0||file.size>2_000_000_000)continue;
    const version=String(file.updated_at||"");
    const id=await sha(file.bucket+"\n"+file.path+"\n"+version);
    const key="isolated-backup/"+file.bucket+"/"+id+"/"+file.path;
    const exists=await env.BACKUP_STATE.prepare("SELECT id FROM backup_objects WHERE id=?").bind(id).first();
    if(exists)continue;
    await env.BACKUP_STATE.prepare(
      "INSERT OR IGNORE INTO backup_objects(id,bucket,source_path,source_size,source_updated,content_type,r2_key,status,created_at) VALUES(?,?,?,?,?,?,?,'pending',?)"
    ).bind(id,file.bucket,file.path,file.size,version,
      file.content_type||"application/octet-stream",key,now).run();
    added++;
  }
  return {found:manifest.files.length,added};
}
async function signedFile(env,file){
  const data=await callOrigin(env,"/api/public/edge-backup/sign",{
    bucket:file.bucket,path:file.source_path
  });
  if(data.size!==file.source_size||data.updated_at!==file.source_updated)
    throw new Error("backup_source_changed");
  if(!data.url||!String(data.url).startsWith("https://"))
    throw new Error("backup_signed_url_invalid");
  return data.url;
}
async function readSource(url,start,end,needRange){
  const res=await fetch(url,{
    method:"GET",
    headers:needRange?{"range":"bytes="+start+"-"+end}:{},
    redirect:"follow",
    signal:AbortSignal.timeout(55000),
    cache:"no-store",
  });
  if(!res.ok)throw new Error("backup_download_http_"+res.status);
  if(needRange&&res.status!==206)throw new Error("backup_range_not_supported_http_"+res.status);
  const data=await res.arrayBuffer();
  if(data.byteLength!==end-start+1)throw new Error("backup_download_size_mismatch");
  return data;
}
async function updateError(env,id,e){
  const err=String(e?.message||"unknown").replace(/https?:\/\/[^\s]+/g,"[url]").slice(0,170);
  await env.BACKUP_STATE.prepare(
    "UPDATE backup_objects SET status='retry',last_error=?,last_attempt_at=? WHERE id=?"
  ).bind(err,new Date().toISOString(),id).run();
  console.warn("private_backup_retry",err);
}
async function writeSmall(env,file){
  const destination=await env.BACKUP_BUCKET.head(file.r2_key);
  if(destination?.size===file.source_size){
    await markComplete(env,file);
    return;
  }
  const url=await signedFile(env,file);
  const bytes=await readSource(url,0,file.source_size-1,false);
  await env.BACKUP_BUCKET.put(file.r2_key,bytes,{
    httpMetadata:{contentType:file.content_type||"application/octet-stream"},
    customMetadata:{backupSource:"lovable-private-storage",sourceVersion:file.source_updated}
  });
  const head=await env.BACKUP_BUCKET.head(file.r2_key);
  if(!head||head.size!==file.source_size)throw new Error("backup_r2_head_mismatch");
  await markComplete(env,file);
}
async function markComplete(env,file){
  await env.BACKUP_STATE.prepare(
    "UPDATE backup_objects SET status='copied_size_verified',copied_bytes=source_size,completed_at=?,last_error=NULL WHERE id=?"
  ).bind(new Date().toISOString(),file.id).run();
  console.log("private_backup_object_copied",JSON.stringify({source:file.bucket,bytes:file.source_size}));
}
async function writeLarge(env,file){
  let uploadId=file.upload_id;
  let parts=JSON.parse(file.parts_json||"[]");
  let next=Math.max(1,Number(file.next_part)||1);
  if(!uploadId){
    const upload=await env.BACKUP_BUCKET.createMultipartUpload(file.r2_key,{
      httpMetadata:{contentType:file.content_type||"application/octet-stream"},
      customMetadata:{backupSource:"lovable-private-storage",sourceVersion:file.source_updated}
    });
    uploadId=upload.uploadId;
    await env.BACKUP_STATE.prepare(
      "UPDATE backup_objects SET status='uploading',upload_id=?,last_attempt_at=? WHERE id=?"
    ).bind(uploadId,new Date().toISOString(),file.id).run();
  }
  const total=Math.ceil(file.source_size/PART_BYTES);
  const url=await signedFile(env,file);
  const upload=env.BACKUP_BUCKET.resumeMultipartUpload(file.r2_key,uploadId);
  for(let i=0;i<MAX_PARTS_PER_TICK&&next<=total;i++){
    const start=(next-1)*PART_BYTES,end=Math.min(file.source_size-1,start+PART_BYTES-1);
    const buf=await readSource(url,start,end,true);
    const part=await upload.uploadPart(next,buf);
    parts=parts.filter(p=>p.partNumber!==next);
    parts.push({partNumber:part.partNumber,etag:part.etag});
    parts.sort((a,b)=>a.partNumber-b.partNumber);
    next++;
    await env.BACKUP_STATE.prepare(
      "UPDATE backup_objects SET status='uploading',next_part=?,parts_json=?,copied_bytes=?,last_error=NULL,last_attempt_at=? WHERE id=?"
    ).bind(next,JSON.stringify(parts),Math.min(file.source_size,(next-1)*PART_BYTES),new Date().toISOString(),file.id).run();
  }
  if(next<=total)return;
  await upload.complete(parts);
  const head=await env.BACKUP_BUCKET.head(file.r2_key);
  if(!head||head.size!==file.source_size)throw new Error("backup_multipart_size_mismatch");
  await markComplete(env,file);
}
async function run(env){
  if(!env.BACKUP_STATE||!env.BACKUP_BUCKET||!env.BACKUP_BRIDGE_TOKEN)
    throw new Error("private_backup_worker_not_configured");
  const enabled=await env.BACKUP_STATE.prepare(
    "SELECT value FROM backup_control WHERE key='enabled'"
  ).first();
  if(enabled?.value!=="true")return {mode:"disabled"};
  // A single migration snapshot contains 27 files. Avoid re-reading
  // the same private 27-object manifest and 27 D1 rows on each minute tick.
  const [inventorySize,expected]=await Promise.all([
    env.BACKUP_STATE.prepare("SELECT COUNT(*) n FROM backup_objects").first(),
    env.BACKUP_STATE.prepare("SELECT value FROM backup_control WHERE key='expected_source_objects'").first(),
  ]);
  const expectedCount=Number(expected?.value||0);
  const catalog=expectedCount>0&&Number(inventorySize?.n||0)>=expectedCount
    ?{found:Number(inventorySize.n),added:0}
    :await recordInventory(env);
  // Back up a small object first to confirm the pipeline. Then protect
  // the database archive, before copying the remaining promotional assets.
  const finished=await env.BACKUP_STATE.prepare(
    "SELECT COUNT(*) as total FROM backup_objects WHERE status='copied_size_verified'").first();
  let object;
  if(!finished?.total){
    object=await env.BACKUP_STATE.prepare(
      "SELECT * FROM backup_objects WHERE status IN ('pending','retry','uploading') AND source_size<=? ORDER BY source_size ASC LIMIT 1"
    ).bind(SMALL_LIMIT).first();
  }
  if(!object){
    object=await env.BACKUP_STATE.prepare(
      "SELECT * FROM backup_objects WHERE status IN ('pending','retry','uploading') ORDER BY CASE WHEN bucket='database_export_15_11_26' THEN 0 ELSE 1 END,source_size ASC LIMIT 1"
    ).first();
  }
  if(!object){
    // One-shot migration: stop scheduled transfer work automatically when
    // there are no source files left in a pending/retry/uploading state.
    await env.BACKUP_STATE.prepare(
      "UPDATE backup_control SET value='false' WHERE key='enabled'"
    ).run();
    return {catalog,mode:"complete_and_disabled"};
  }
  try{
    if(object.source_size<=SMALL_LIMIT)await writeSmall(env,object);
    else await writeLarge(env,object);
  }catch(e){await updateError(env,object.id,e);throw e;}
  return {catalog,mode:"copying",source:object.bucket};
}
export default {
 async scheduled(_controller,env,ctx){
  ctx.waitUntil((async()=>{
    // D1 compare-and-set lease prevents overlapping scheduled multipart
    // writes. A crashed run frees itself after five minutes.
    const now=Date.now(),leaseUntil=now+5*60_000;
    const lock=await env.BACKUP_STATE.prepare(
      "INSERT INTO backup_control(key,value) VALUES('worker_lease_until',?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value "+
      "WHERE CAST(backup_control.value AS INTEGER)<?"
    ).bind(String(leaseUntil),now).run();
    if(!lock.meta?.changes)return {mode:"lease_held"};
    try{return await run(env);}
    finally{
      await env.BACKUP_STATE.prepare(
        "UPDATE backup_control SET value='0' WHERE key='worker_lease_until' AND value=?"
      ).bind(String(leaseUntil)).run();
    }
  })().then(x=>console.log("private_backup_cycle_ok",JSON.stringify(x)))
    .catch(e=>console.error("private_backup_cycle_failed",String(e?.message||e).slice(0,160))));
 },
 async fetch(){
  // Private backup service has no externally callable API.
  return new Response("Not Found",{status:404});
 }
};

/**
 * Service-binding-only RPC. The Worker has no workers.dev URL or public
 * route, and its default HTTP handler remains 404. The token never leaves
 * Cloudflare: only its SHA256 is sent to the signed enrollment endpoint.
 */
export class BackupEnrollment extends WorkerEntrypoint {
  async getSecretFingerprint(){
    const token=this.env.BACKUP_BRIDGE_TOKEN;
    const valid=typeof token==="string"&&/^[a-zA-Z0-9_-]{64,128}$/.test(token);
    return {
      configured:typeof token==="string"&&token.length>0,
      valid,
      sha256:valid?await sha(token):null
    };
  }
  async testManifest(){
    const token=this.env.BACKUP_BRIDGE_TOKEN;
    if(typeof token!=="string"||!/^[a-zA-Z0-9_-]{64,128}$/.test(token))
      return {ok:false,reason:"secret_invalid_format"};
    try{
      const result=await callOrigin(this.env,"/api/public/edge-backup/manifest");
      return {ok:true,count:result.count,
        groups:(result.files||[]).reduce((a,f)=>{a[f.bucket]=(a[f.bucket]||0)+1;return a;},{})};
    }catch(e){
      return {ok:false,reason:String(e?.message||e).slice(0,110)};
    }
  }
  /**
   * Verify the source and R2 bytes of the canary match cryptographically.
   * Separately confirm private Storage supports bounded HTTP Range for the
   * PostgreSQL archive. Do not download the full archive in a single Worker.
   */
  async verifyCanaryAndArchiveRange(){
    const file=await this.env.BACKUP_STATE.prepare(
      "SELECT * FROM backup_objects WHERE status='copied_size_verified' AND source_size<=? ORDER BY source_size ASC LIMIT 1"
    ).bind(SMALL_LIMIT).first();
    if(!file)return {ok:false,reason:"canary_missing"};
    const saved=await this.env.BACKUP_BUCKET.get(file.r2_key);
    if(!saved||saved.size!==file.source_size)return {ok:false,reason:"r2_canary_missing"};
    const sourceUrl=await signedFile(this.env,file);
    const sourceBytes=await readSource(sourceUrl,0,file.source_size-1,false);
    const targetBytes=await saved.arrayBuffer();
    const [left,right]=await Promise.all([
      crypto.subtle.digest("SHA-256",sourceBytes),
      crypto.subtle.digest("SHA-256",targetBytes)
    ]);
    const first=new Uint8Array(left),second=new Uint8Array(right);
    const equal=first.length===second.length&&first.every((b,i)=>b===second[i]);
    if(!equal)return {ok:false,reason:"canary_sha256_mismatch"};
    const archive=await this.env.BACKUP_STATE.prepare(
      "SELECT * FROM backup_objects WHERE bucket='database_export_15_11_26' AND source_size>? LIMIT 1"
    ).bind(SMALL_LIMIT).first();
    if(!archive)return {ok:false,reason:"archive_not_in_inventory",canarySha256Match:true};
    const archiveUrl=await signedFile(this.env,archive);
    const response=await fetch(archiveUrl,{
      method:"GET",headers:{range:"bytes=0-1023"},
      redirect:"follow",cache:"no-store",signal:AbortSignal.timeout(20000)
    });
    const contentRange=response.headers.get("content-range")||"";
    const rightStatus=response.status===206
      &&contentRange.startsWith("bytes 0-1023/")
      &&contentRange.endsWith("/"+archive.source_size);
    if(!rightStatus){
      if(response.body)await response.body.cancel().catch(()=>{});
      return {ok:false,reason:"archive_range_not_supported_"+response.status,canarySha256Match:true};
    }
    const chunk=await response.arrayBuffer();
    if(chunk.byteLength!==1024)return {ok:false,reason:"archive_range_wrong_size",canarySha256Match:true};
    return {ok:true,canarySha256Match:true,archiveRangeSupported:true,canaryBytes:file.source_size};
  }
  async canaryCopySmall(){
    if(!(await this.testManifest()).ok)return {ok:false,reason:"manifest_not_verified"};
    const inventory=await recordInventory(this.env);
    const existing=await this.env.BACKUP_STATE.prepare(
      "SELECT * FROM backup_objects WHERE status='copied_size_verified' AND source_size<=? ORDER BY source_size ASC LIMIT 1"
    ).bind(SMALL_LIMIT).first();
    if(existing)return {ok:true,already:true,bytes:existing.source_size};
    const file=await this.env.BACKUP_STATE.prepare(
      "SELECT * FROM backup_objects WHERE status IN ('pending','retry') AND source_size<=? ORDER BY source_size ASC LIMIT 1"
    ).bind(SMALL_LIMIT).first();
    if(!file)return {ok:false,reason:"no_small_source_file",inventoryCount:inventory.found};
    try{
      await writeSmall(this.env,file);
      return {ok:true,copied:true,bytes:file.source_size};
    }catch(e){
      await updateError(this.env,file.id,e);
      return {ok:false,reason:String(e?.message||e).slice(0,110)};
    }
  }
}
