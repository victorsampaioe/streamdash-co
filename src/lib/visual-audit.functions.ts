import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AuditTarget={label:string;url:string};
type AuditResult={label:string;url:string;status:"ok"|"failed"|"partial";httpStatus:number|null;durationMs:number|null;screenshot:boolean;mode:"browser"|"http"};
const STATIC_TARGETS:AuditTarget[]=[
  {label:"Página principal",url:"https://streammonitor.site/"},
  {label:"Login e autenticação",url:"https://streammonitor.site/auth"},
  {label:"Status da API",url:"https://streammonitor.site/api/public/health"}
];

async function auditUrl(target:AuditTarget,ownerId:string):Promise<AuditResult & {path:string|null}>{
  // Server-maintained destinations only. No arbitrary URLs or redirects (SSRF).
  const allowed=new URL(target.url);
  if(allowed.hostname!=="streammonitor.site"||allowed.protocol!=="https:")
    throw new Error("Destino não autorizado");
  const start=Date.now();
  const id=crypto.randomUUID();
  let httpStatus:number|null=null;
  let mode:"browser"|"http"="http";
  let screenshotPath:string|null=null;
  let status:AuditResult["status"]="failed";
  try{
    const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
    const token=process.env.CLOUDFLARE_API_TOKEN;
    if(accountId&&token){
      const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/snapshot`,{
        method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
        body:JSON.stringify({url:target.url,formats:["content","screenshot","accessibilityTree"],
          screenshotOptions:{type:"png",fullPage:false},
          gotoOptions:{waitUntil:"domcontentloaded",timeout:20000}}),
        redirect:"error",signal:AbortSignal.timeout(28000)
      });
      if(response.ok){
        const json=await response.json() as any;
        if(json.success){
          mode="browser";
          httpStatus=Number(json.meta?.status)||null;
          const html=String(json.result?.content||"");
          const hasPage=html.includes("<html")&&html.includes("<body");
          status=httpStatus===200&&hasPage?"ok":"partial";
          const raw=String(json.result?.screenshot||"");
          if(raw&&raw.length<12*1024*1024){
            const bytes=Uint8Array.from(Buffer.from(raw,"base64"));
            const path=`${ownerId}/audits/${id}.png`;
            const {error}=await supabaseAdmin.storage.from("stream-evidence")
              .upload(path,bytes,{contentType:"image/png",upsert:false});
            if(!error)screenshotPath=path;
          }
        }
      }
    }
    if(mode==="http"){
      const response=await fetch(target.url,{method:"GET",redirect:"error",
        headers:{"user-agent":"StreamMonitorVisualAudit/1.0"},
        signal:AbortSignal.timeout(16000)});
      httpStatus=response.status;
      const body=await response.text();
      const hasHtml=body.includes("<html")&&body.includes("<body");
      status=response.ok && (hasHtml||target.url.includes("/api/public/health"))?"partial":"failed";
    }
  }catch{status="failed";}
  const durationMs=Date.now()-start;
  const {error:dbErr}=await supabaseAdmin.from("visual_audit_checks" as any).insert({
    owner_id:ownerId,label:target.label,target_url:target.url,status,
    http_status:httpStatus,duration_ms:durationMs,
    screenshot_storage_path:screenshotPath,checked_at:new Date().toISOString()
  });
  if(dbErr)throw new Error("Não foi possível salvar a auditoria");
  return {label:target.label,url:target.url,status,httpStatus,durationMs,mode,screenshot:!!screenshotPath,path:screenshotPath};
}
export const runVisualAudit=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const {data:isAdmin,error:roleError}=await supabaseAdmin.rpc("has_role",{
      _user_id:context.userId,_role:"admin"
    });
    if(roleError||!isAdmin)throw new Error("Acesso somente para administrador.");
    const targets=[...STATIC_TARGETS];
    const {data:help}=await supabaseAdmin.from("reseller_help_settings" as any)
      .select("slug").eq("enabled",true).order("created_at",{ascending:true}).limit(1);
    if(help?.[0]?.slug&&/^[a-z0-9-]{2,40}$/.test(help[0].slug)){
      targets.push({label:"Central pública de Ajuda",url:`https://streammonitor.site/ajuda/${help[0].slug}`});
    }
    const results=[];
    for(const target of targets)results.push(await auditUrl(target,context.userId));
    return {results,mode:results.some(x=>x.mode==="browser")?"browser":"http"};
  });
