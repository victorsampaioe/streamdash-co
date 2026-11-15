import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

async function requireVitrineAdmin(context:any){
  const {data,error}=await context.supabase.rpc("has_role",{
    _user_id:context.userId,_role:"admin",
  });
  if(error||data!==true)throw new Error("Vitrine cinematográfica: acesso exclusivo do administrador.");
}

export const getCinematicTmdbDetail=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:{media:"movie"|"tv";id:number})=>z.object({
    media:z.enum(["movie","tv"]),
    id:z.number().int().positive(),
  }).parse(input))
  .handler(async ({context,data})=>{
    await requireVitrineAdmin(context);
    const {fetchDetail,fetchCinematicExtras}=await import("./tmdb.server");
    const [detail,extras]=await Promise.all([
      fetchDetail(data.media,data.id),
      fetchCinematicExtras(data.media,data.id),
    ]);
    return {
      detail:{
        tmdb_id:detail.tmdb_id,media_type:detail.media_type,title:detail.title,
        overview:detail.overview,release_date:detail.release_date,
        poster_path:detail.poster_path,backdrop_path:detail.backdrop_path,
        genres:detail.genres,
      },
      extras,
    };
  });

export type CinematicBrand={
  owner_id:string;
  name:string;
  logo_url:string;
  whatsapp:string;
  color:string;
};
const colorPattern=/^#[0-9a-fA-F]{6}$/;
export const getCinematicBrands=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requireVitrineAdmin(context);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const [pages,promo,profile]=await Promise.all([
      db.from("reseller_pages").select("owner_id,display_name,logo_url,whatsapp,primary_color").limit(200),
      db.from("promo_brand_settings").select("owner_id,brand_name,logo_url,whatsapp,primary_color").limit(200),
      db.from("profiles").select("id,full_name,whatsapp,phone").eq("id",context.userId).maybeSingle(),
    ]);
    if(pages.error||promo.error)throw new Error("Falha ao carregar marcas cadastradas.");
    const byOwner=new Map<string,CinematicBrand>();
    const upsert=(owner_id:string|null|undefined,data:Partial<CinematicBrand>)=>{
      if(!owner_id||!/^[0-9a-f-]{36}$/i.test(owner_id))return;
      const old=byOwner.get(owner_id)||{
        owner_id,name:"Minha Revenda",logo_url:"",whatsapp:"",color:"#2563eb",
      };
      byOwner.set(owner_id,{
        owner_id,
        name:data.name?.trim()||old.name,
        logo_url:data.logo_url?.trim()||old.logo_url,
        whatsapp:data.whatsapp?.trim()||old.whatsapp,
        color:data.color&&colorPattern.test(data.color)?data.color:old.color,
      });
    };
    for(const item of (pages.data??[]) as any[])
      upsert(item.owner_id,{name:item.display_name,logo_url:item.logo_url,whatsapp:item.whatsapp,color:item.primary_color});
    for(const item of (promo.data??[]) as any[])
      upsert(item.owner_id,{name:item.brand_name,logo_url:item.logo_url,whatsapp:item.whatsapp,color:item.primary_color});
    const me=profile.data as {full_name?:string;whatsapp?:string;phone?:string}|null;
    if(!byOwner.has(context.userId))upsert(context.userId,{
      name:me?.full_name||"Stream Monitor",
      whatsapp:me?.whatsapp||me?.phone||"",
    });
    return {currentOwner:context.userId,brands:[...byOwner.values()]
      .sort((a,b)=>a.owner_id===context.userId?-1:b.owner_id===context.userId?1:a.name.localeCompare(b.name,"pt-BR"))};
  });
