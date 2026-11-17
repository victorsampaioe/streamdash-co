import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {requirePaidFeature} from "@/lib/premium-feature-access";
import {z} from "zod";

export type VideoModel={
  id:string;title:string;description:string;storage_path:string;
  duration_seconds:number;width:number;height:number;size_bytes:number;
  active:boolean;sort_order:number;created_at:string;video_url:string;
};
const BUCKET="vitrine-video-modelos";
const pathPattern=/^templates\/[0-9a-f-]{36}\.mp4$/;
async function requireVideoAdmin(context:any){
  const {data,error}=await context.supabase.rpc("has_role",{
    _user_id:context.userId,_role:"admin"
  });
  if(error||data!==true)throw new Error("Acesso exclusivo do administrador.");
}
async function adminClient(){
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
/** A private storage bucket. Only signed-in, paid revendas (or admins)
 * obtain time-limited links; original videos do not become public assets.
 */
export const listVideoModels=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    await requirePaidFeature(context);
    const db=await adminClient();
    const {data:role}=await context.supabase.rpc("has_role",{
      _user_id:context.userId,_role:"admin"
    });
    const isAdmin=role===true;
    const query=db.from("vitrine_video_templates")
      .select("id,title,description,storage_path,duration_seconds,width,height,size_bytes,active,sort_order,created_at")
      .order("sort_order",{ascending:true})
      .order("created_at",{ascending:false})
      .limit(150);
    if(!isAdmin)query.eq("active",true);
    const {data,error}=await query;
    if(error)throw new Error("Não foi possível consultar os vídeos.");
    const models=await Promise.all((data||[]).map(async(row:any)=>{
      const {data:signed,error:signError}=await db.storage.from(BUCKET)
        .createSignedUrl(row.storage_path,3600);
      if(signError||!signed?.signedUrl)return null;
      return {...row,video_url:signed.signedUrl} as VideoModel;
    }));
    return {models:models.filter((model):model is VideoModel=>!!model),
      is_admin:isAdmin};
  });

const createInput=z.object({
  title:z.string().trim().min(2).max(100),
  description:z.string().trim().max(350).default(""),
  path:z.string().regex(pathPattern),
  seconds:z.number().int().min(1).max(120),
  width:z.number().int().min(128).max(2160),
  height:z.number().int().min(128).max(3840),
  bytes:z.number().int().min(1024).max(104857600)
});
export const registerVideoModel=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((raw:unknown)=>createInput.parse(raw))
  .handler(async({context,data})=>{
    await requireVideoAdmin(context);
    const db=await adminClient();
    // Confirm an object of the exact requested name exists before listing.
    const fileName=data.path.split("/")[1];
    const {data:existing,error:storageError}=await db.storage
      .from(BUCKET).list("templates",{limit:100,search:fileName});
    if(storageError||!existing?.some((object:any)=>
      object.name===fileName && (object.metadata?.mimetype==="video/mp4"||
        object.metadata?.mimetype==="video/quicktime"||
        object.metadata?.mimetype===undefined)))
      throw new Error("Arquivo não encontrado no armazenamento. Reenvie o MP4.");
    const {data:created,error}=await db.from("vitrine_video_templates")
      .insert({
        title:data.title,description:data.description,storage_path:data.path,
        duration_seconds:data.seconds,width:data.width,height:data.height,
        size_bytes:data.bytes,active:true,created_by:context.userId,
      }).select("id").single();
    if(error)throw new Error("Não foi possível salvar o modelo de vídeo.");
    return {id:created.id,created:true};
  });

export const updateVideoModel=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((raw:unknown)=>z.object({
    id:z.string().uuid(),active:z.boolean()
  }).parse(raw))
  .handler(async({context,data})=>{
    await requireVideoAdmin(context);
    const db=await adminClient();
    const {error}=await db.from("vitrine_video_templates")
      .update({active:data.active}).eq("id",data.id);
    if(error)throw new Error("Não foi possível atualizar o vídeo.");
    return {updated:true};
  });

export const removeVideoModel=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((raw:unknown)=>z.object({id:z.string().uuid()}).parse(raw))
  .handler(async({context,data})=>{
    await requireVideoAdmin(context);
    const db=await adminClient();
    const {data:row,error:lookupError}=await db.from("vitrine_video_templates")
      .select("storage_path").eq("id",data.id).maybeSingle();
    if(lookupError||!row)throw new Error("Vídeo não encontrado.");
    // Disable before removing storage. Keeping an inactive row after a
    // transient storage failure permits a safe retry without leaking links.
    const {error:disableError}=await db.from("vitrine_video_templates")
      .update({active:false}).eq("id",data.id);
    if(disableError)throw new Error("Não foi possível desativar este modelo.");
    const {error:deleteStorageError}=await db.storage.from(BUCKET).remove([row.storage_path]);
    if(deleteStorageError)throw new Error("Não foi possível apagar o MP4. O modelo ficou desativado.");
    const {error}=await db.from("vitrine_video_templates").delete().eq("id",data.id);
    if(error)throw new Error("Arquivo removido, mas o registro exige limpeza.");
    return {deleted:true};
  });
