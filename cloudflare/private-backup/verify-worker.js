import {WorkerEntrypoint} from "cloudflare:workers";
import {createHash} from "node:crypto";

/**
 * Private independent archive verification. A completed multipart R2 object
 * is streamed through incremental SHA-256 without loading the ~435MB file
 * into Worker memory. It never returns data, URLs, secrets, or archive bytes.
 */
async function verifyArchive(env){
  const existing=await env.BACKUP_STATE.prepare(
    "SELECT value FROM backup_control WHERE key='archive_sha256_result'"
  ).first();
  if(existing?.value==="matched")
    return {ok:true,matched:true,already:true};

  const item=await env.BACKUP_STATE.prepare(
    "SELECT r2_key,source_size FROM backup_objects "+
    "WHERE bucket='database_export_15_11_26' AND status='copied_size_verified' LIMIT 1"
  ).first();
  if(!item)return {ok:false,reason:"archive_not_yet_copied"};
  const expected=await env.BACKUP_STATE.prepare(
    "SELECT value FROM backup_control WHERE key='archive_expected_sha256'"
  ).first();
  if(!/^[a-f0-9]{64}$/.test(expected?.value||""))
    return {ok:false,reason:"expected_sha256_not_configured"};

  const object=await env.BACKUP_BUCKET.get(item.r2_key);
  if(!object?.body)return {ok:false,reason:"r2_archive_missing"};
  if(object.size!==item.source_size)
    return {ok:false,reason:"r2_archive_wrong_size"};
  const hash=createHash("sha256");
  const reader=object.body.getReader();
  let readBytes=0;
  try{
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      const bytes=chunk.value;
      if(!(bytes instanceof Uint8Array))throw new Error("r2_chunk_invalid");
      hash.update(bytes);
      readBytes+=bytes.byteLength;
    }
  }finally{reader.releaseLock();}
  const digest=hash.digest("hex");
  const matched=readBytes===item.source_size&&digest===expected.value;
  const stamp=new Date().toISOString();
  await env.BACKUP_STATE.batch([
    env.BACKUP_STATE.prepare(
      "INSERT INTO backup_control(key,value) VALUES('archive_sha256_result',?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(matched?"matched":"mismatched"),
    env.BACKUP_STATE.prepare(
      "INSERT INTO backup_control(key,value) VALUES('archive_sha256_checked_at',?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(stamp),
    env.BACKUP_STATE.prepare(
      "INSERT INTO backup_control(key,value) VALUES('archive_actual_sha256',?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(digest),
  ]);
  console.log("private_archive_sha256_verification",JSON.stringify({matched,bytes:readBytes}));
  return {ok:matched,matched,bytes:readBytes};
}


/**
 * Compute the full streaming SHA-256 of the 19 November R2 PostgreSQL
 * archive. This only proves the R2 copy is completely readable, NOT that the
 * PostgreSQL archive can be restored or is identical to the source.
 * The source checksum is intentionally not inferred from multipart ETags.
 */
async function verifyRecentArchive(env) {
 const state=await env.BACKUP_STATE.prepare(
   "SELECT value FROM backup_control WHERE key='archive_recent_integrity_status'"
 ).first();
 if(state?.value==="hashed_without_origin_reference")return {ok:true,already:true};
 const item=await env.BACKUP_STATE.prepare(
   "SELECT r2_key,source_size FROM backup_objects WHERE bucket='database_export_19_11_26' "+
   "AND status='copied_size_verified' LIMIT 1"
 ).first();
 if(!item)return {ok:false,reason:"recent_archive_not_available"};
 const object=await env.BACKUP_BUCKET.get(item.r2_key);
 if(!object?.body||object.size!==item.source_size)
   return {ok:false,reason:"recent_archive_missing_or_size_mismatch"};
 const hash=createHash("sha256");
 const reader=object.body.getReader();
 let bytes=0;
 try {
   for(;;) {
     const part=await reader.read();
     if(part.done)break;
     if(!(part.value instanceof Uint8Array))throw Error("r2_stream_invalid");
     hash.update(part.value);
     bytes+=part.value.byteLength;
   }
 }finally{reader.releaseLock();}
 const full=bytes===item.source_size;
 const digest=hash.digest("hex");
 await env.BACKUP_STATE.batch([
   env.BACKUP_STATE.prepare(
     "INSERT INTO backup_control(key,value) VALUES('archive_recent_integrity_status',?) "+
     "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
   ).bind(full?"hashed_without_origin_reference":"short_read"),
   env.BACKUP_STATE.prepare(
     "INSERT INTO backup_control(key,value) VALUES('archive_recent_actual_sha256',?) "+
     "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
   ).bind(digest),
   env.BACKUP_STATE.prepare(
     "INSERT INTO backup_control(key,value) VALUES('archive_recent_checked_at',?) "+
     "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
   ).bind(new Date().toISOString()),
   env.BACKUP_STATE.prepare(
     "INSERT INTO backup_control(key,value) VALUES('archive_recent_read_bytes',?) "+
     "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
   ).bind(String(bytes))
 ]);
 return {ok:full,bytes,sourceChecksumVerified:false,restored:false};
}

export default {
  async fetch(){return new Response("Not Found",{status:404});}
};
export class BackupVerify extends WorkerEntrypoint{
  async verifyArchive(){return await verifyArchive(this.env);}
  async verifyRecentArchive(){return await verifyRecentArchive(this.env);}
}
