import {createHash,timingSafeEqual} from "node:crypto";
import {supabaseAdmin} from "@/integrations/supabase/client.server";

/** Dedicated least-scope backup token. Hash is kept in restricted app_settings.
 * Only Cloudflare backup Worker has the plaintext secret.
 * Never reuse regional monitoring credentials for reading private storage.
 */
export async function authorizePrivateBackup(request:Request){
 const token=request.headers.get("x-sm-backup-key")??"";
 if(!/^[a-zA-Z0-9_-]{64,128}$/.test(token))return false;
 const {data,error}=await supabaseAdmin.from("app_settings").select("value")
   .eq("key","cf_private_backup_auth").maybeSingle();
 const hash=(data?.value as {sha256?:string}|null)?.sha256;
 if(error||!hash||!/^[a-f0-9]{64}$/i.test(hash))return false;
 const actual=createHash("sha256").update(token).digest();
 const expected=Buffer.from(hash,"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export const PRIVATE_BACKUP_BUCKETS=new Set([
 "database_export_15_11_26","promo-arts"
]);

export async function listPrivateBackupObjects(){
 const files:Array<{bucket:string;path:string;size:number;updated_at:string;content_type:string}>=[];
 for(const bucket of PRIVATE_BACKUP_BUCKETS){
   const prefixes=[""];
   let scanned=0;
   while(prefixes.length){
     const prefix=prefixes.shift()!;
     if(++scanned>250)throw new Error("backup_inventory_too_large");
     const {data,error}=await supabaseAdmin.storage.from(bucket).list(prefix,{limit:1000,offset:0,sortBy:{column:"name",order:"asc"}});
     if(error)throw new Error("backup_inventory_unavailable");
     for(const entry of data??[]){
       if(entry.name===".emptyFolderPlaceholder")continue;
       const path=prefix?prefix+"/"+entry.name:entry.name;
       if(!entry.id){
         prefixes.push(path);
         continue;
       }
       const size=Number(entry.metadata?.size||0);
       if(!Number.isSafeInteger(size)||size<=0||size>2_000_000_000)
         throw new Error("backup_invalid_object_size");
       files.push({
         bucket,path,size,
         updated_at:String(entry.updated_at||entry.created_at||""),
         content_type:String(entry.metadata?.mimetype||"application/octet-stream"),
       });
     }
   }
 }
 if(files.length>250)throw new Error("backup_inventory_exceeds_limit");
 return files;
}
