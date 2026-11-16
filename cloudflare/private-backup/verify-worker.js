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

export default {
  async fetch(){return new Response("Not Found",{status:404});}
};
export class BackupVerify extends WorkerEntrypoint{
  async verifyArchive(){return await verifyArchive(this.env);}
}
