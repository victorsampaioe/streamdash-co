import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

async function requireVitrineAdmin(context:any){
  // Supabase auth middleware validates the JWT claims before this check.
  if(String(context.claims?.email||"").toLowerCase()==="victorsampaio133@gmail.com")return;
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
      name:me?.full_name||"Minha Revenda",
      whatsapp:me?.whatsapp||me?.phone||"",
    });
    return {currentOwner:context.userId,brands:[...byOwner.values()]
      .sort((a,b)=>a.owner_id===context.userId?-1:b.owner_id===context.userId?1:a.name.localeCompare(b.name,"pt-BR"))};
  });

const policySchema=z.object({
  defaultDailyLimit:z.number().int().min(1).max(50).default(5),
  maxUploadMb:z.number().int().min(25).max(350).default(350),
  overrides:z.record(z.string().uuid(),z.number().int().min(0).max(50)).default({}),
  resellerEnabled:z.literal(false).default(false),
});
export type CinematicRenderPolicy=z.infer<typeof policySchema>;
const fallbackPolicy:CinematicRenderPolicy={
  defaultDailyLimit:5,maxUploadMb:350,overrides:{},resellerEnabled:false,
};
const auditInput=z.object({
  request_id:z.string().uuid(),
  brand_owner_id:z.string().uuid(),
  media_type:z.enum(["movie","tv"]),
  tmdb_id:z.number().int().positive(),
  output_format:z.enum(["portrait","story"]),
  seconds:z.union([z.literal(15),z.literal(30),z.literal(60)]),
  audio_requested:z.boolean(),
  status:z.enum(["completed","failed"]),
  bytes_out:z.number().int().min(0).max(2_000_000_000).optional(),
  error_code:z.enum(["ENCODING_UNSUPPORTED","INPUT_INVALID","EXPORT_ERROR","DECODE_ERROR","UNKNOWN_ERROR"]).nullable().optional(),
});

export const getCinematicRenderControls=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requireVitrineAdmin(context);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const since=new Date(Date.now()-30*86400_000).toISOString();
    const [settings,logs]=await Promise.all([
      db.from("app_settings").select("value").eq("key","vitrine_video_render_policy").maybeSingle(),
      db.from("vitrine_video_render_audit")
        .select("created_at,brand_owner_id,status,bytes_out,error_code")
        .gte("created_at",since).order("created_at",{ascending:false}).limit(400),
    ]);
    if(settings.error||logs.error)throw new Error("Não foi possível carregar os controles do gerador.");
    const policy=policySchema.safeParse(settings.data?.value);
    const rows=(logs.data??[]) as Array<{
      created_at:string;brand_owner_id:string;status:"completed"|"failed";
      bytes_out:number|null;error_code:string|null;
    }>;
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    return {
      policy:policy.success?policy.data:fallbackPolicy,
      summary:{
        total:rows.length,
        completed:rows.filter(x=>x.status==="completed").length,
        errors:rows.filter(x=>x.status==="failed").length,
        exportedBytes:rows.filter(x=>x.status==="completed").reduce((n,x)=>n+Number(x.bytes_out||0),0),
        today:rows.filter(x=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(x.created_at))===today).length,
      },
      recentErrors:rows.filter(x=>x.status==="failed").slice(0,12)
        .map(x=>({at:x.created_at,code:x.error_code||"UNKNOWN_ERROR"})),
    };
  });

export const saveCinematicRenderControls=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:{
    defaultDailyLimit:number;maxUploadMb:number;overrides:Record<string,number>;
  })=>policySchema.omit({resellerEnabled:true}).parse(input))
  .handler(async ({context,data})=>{
    await requireVitrineAdmin(context);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const value=policySchema.parse({...data,resellerEnabled:false});
    const {error}=await supabaseAdmin.from("app_settings").upsert({
      key:"vitrine_video_render_policy",value,
      updated_at:new Date().toISOString(),
    } as never,{onConflict:"key"});
    if(error)throw new Error("Falha ao salvar limites administrativos.");
    return {saved:true,policy:value};
  });

export const recordCinematicRender=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:z.input<typeof auditInput>)=>auditInput.parse(input))
  .handler(async ({context,data})=>{
    await requireVitrineAdmin(context);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const payload={
      request_id:data.request_id,
      actor_id:context.userId,
      brand_owner_id:data.brand_owner_id,
      media_type:data.media_type,
      tmdb_id:data.tmdb_id,
      output_format:data.output_format,
      seconds:data.seconds,
      audio_requested:data.audio_requested,
      status:data.status,
      bytes_out:data.status==="completed"?data.bytes_out??0:null,
      error_code:data.status==="failed"?data.error_code??"UNKNOWN_ERROR":null,
    };
    const {error}=await supabaseAdmin.from("vitrine_video_render_audit" as any)
      .insert(payload as any);
    if(error?.code==="23505")return {recorded:false,duplicate:true};
    if(error)throw new Error("Não foi possível registrar o resultado da renderização.");
    return {recorded:true,duplicate:false};
  });


/**
 * Static cinematic Banner is available to every signed-in Stream Monitor user.
 * Do not reuse the admin Video functions: they intentionally expose additional
 * reseller identities and private generation controls.
 * This function returns only public TMDB metadata of the selected title.
 */
export const getCinematicBannerDetail=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:{media:"movie"|"tv";id:number})=>z.object({
    media:z.enum(["movie","tv"]),
    id:z.number().int().positive(),
  }).parse(input))
  .handler(async ({data})=>{
    const {fetchDetail,fetchCinematicExtras}=await import("./tmdb.server");
    const [detail,extras]=await Promise.all([
      fetchDetail(data.media,data.id),fetchCinematicExtras(data.media,data.id),
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

/**
 * Never return other users' branding to a public Banner user.
 * The service client runs only server-side, with an explicit owner_id
 * predicate on EVERY read, regardless of RLS availability.
 */
export const getCinematicBannerBrand=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const ownerId=context.userId;
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const [promo,page,profile]=await Promise.all([
      db.from("promo_brand_settings")
        .select("brand_name,logo_url,whatsapp,primary_color")
        .eq("owner_id",ownerId).maybeSingle(),
      db.from("reseller_pages")
        .select("display_name,logo_url,whatsapp,primary_color")
        .eq("owner_id",ownerId).maybeSingle(),
      db.from("profiles")
        .select("full_name,phone,whatsapp")
        .eq("id",ownerId).maybeSingle(),
    ]);
    if(promo.error||page.error||profile.error)
      throw new Error("Não foi possível carregar sua identidade de revenda.");
    const saved=promo.data as {
      brand_name?:string|null;logo_url?:string|null;
      whatsapp?:string|null;primary_color?:string|null;
    }|null;
    const registered=page.data as {
      display_name?:string|null;logo_url?:string|null;
      whatsapp?:string|null;primary_color?:string|null;
    }|null;
    const me=profile.data as {
      full_name?:string|null;whatsapp?:string|null;phone?:string|null;
    }|null;
    const first=(...values:(string|null|undefined)[])=>
      values.map(x=>String(x??"").trim()).find(Boolean)||"";
    const resolvedColor=first(saved?.primary_color,registered?.primary_color);
    const brand:CinematicBrand={
      owner_id:ownerId,
      name:first(saved?.brand_name,registered?.display_name,me?.full_name)||"Minha Revenda",
      logo_url:first(saved?.logo_url,registered?.logo_url),
      whatsapp:first(saved?.whatsapp,registered?.whatsapp,me?.whatsapp,me?.phone),
      color:colorPattern.test(resolvedColor)?resolvedColor:"#2563eb",
    };
    return {currentOwner:ownerId,brands:[brand]};
  });
