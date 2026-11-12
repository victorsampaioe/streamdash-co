import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AuditTarget={label:string;url:string};
type AuditResult={label:string;url:string;status:"ok"|"failed"|"partial"|"unavailable";httpStatus:number|null;durationMs:number|null;screenshot:boolean;mode:"browser"|"http";diagnostic:string|null;checkId:string};
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
  const start=performance.now();
  const id=crypto.randomUUID();
  let httpStatus:number|null=null;
  let mode:"browser"|"http"="http";
  let screenshotPath:string|null=null;
  let status:AuditResult["status"]="unavailable";
  let diagnostic:string|null=null;
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
          const hasPage=/<html\b/i.test(html)&&/<body\b/i.test(html);
          status=httpStatus===200&&hasPage?"ok":httpStatus && httpStatus>=400?"failed":"partial";
          diagnostic=status==="ok"?null:"browser_incomplete_or_http_error";
          const raw=String(json.result?.screenshot||"");
          if(raw&&raw.length<12*1024*1024){
            const bytes=Uint8Array.from(Buffer.from(raw,"base64"));
            const path=`${ownerId}/audits/${id}.png`;
            const {error}=await supabaseAdmin.storage.from("stream-evidence")
              .upload(path,bytes,{contentType:"image/png",upsert:false});
            if(!error)screenshotPath=path;
            else diagnostic="screenshot_storage_failed";
          }
        } else {
          diagnostic="browser_render_response_invalid";
        }
      } else {
        diagnostic=`browser_render_http_${response.status}`;
      }
    }
    if(mode==="http"){
      const response=await fetch(target.url,{method:"GET",redirect:"manual",
        headers:{"user-agent":"StreamMonitorVisualAudit/1.0"},
        signal:AbortSignal.timeout(16000)});
      httpStatus=response.status;
      const body=await response.text();
      const hasHtml=/<html\b/i.test(body)&&/<body\b/i.test(body);
      const isHealth=allowed.pathname==="/api/public/health";
      const healthOk=isHealth && response.ok && /"status"\s*:\s*"ok"/.test(body);
      status=(response.ok && (hasHtml||healthOk))?"partial":"failed";
      diagnostic=status==="partial"?"http_only_no_browser_capture":`http_${response.status}_or_invalid_body`;
    }
  }catch(error){
    // A failed outbound request is an audit-tool problem, not proof of downtime.
    status=httpStatus && httpStatus>=400?"failed":"unavailable";
    diagnostic=error instanceof Error && (error.name==="TimeoutError"||error.name==="AbortError")
      ?"audit_request_timeout":"audit_network_unavailable";
  }
  if(mode==="browser" && status==="ok" && !screenshotPath){
    status="partial";
    diagnostic=diagnostic||"browser_screenshot_unavailable";
  }
  const durationMs=Math.max(1,Math.round(performance.now()-start));
  const {error:dbErr}=await supabaseAdmin.from("visual_audit_checks" as any).insert({
    id,owner_id:ownerId,label:target.label,target_url:target.url,status,
    http_status:httpStatus,duration_ms:durationMs,diagnostic,probe_mode:mode,
    screenshot_storage_path:screenshotPath,checked_at:new Date().toISOString()
  });
  if(dbErr)throw new Error("Não foi possível salvar a auditoria");
  return {checkId:id,label:target.label,url:target.url,status,httpStatus,durationMs,mode,screenshot:!!screenshotPath,path:screenshotPath,diagnostic};
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

/**
 * Browser-side same-origin fallback for when the server runtime cannot make
 * outbound requests. The browser result is always "partial", never "verified".
 * Validates ownership and admin role, so arbitrary records cannot be rewritten.
 */
export const saveVisualAuditBrowserProbe=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((data)=>z.object({
    checkId:z.string().uuid(),
    httpStatus:z.number().int().min(100).max(599).nullable(),
    durationMs:z.number().int().min(1).max(60000),
    hasExpectedContent:z.boolean(),
    errorCode:z.enum(["none","browser_network_failure","browser_timeout","browser_invalid_response"])
  }).parse(data))
  .handler(async ({data,context})=>{
    const {data:isAdmin,error:roleErr}=await supabaseAdmin.rpc("has_role",{
      _user_id:context.userId,_role:"admin"
    });
    if(roleErr||!isAdmin)throw new Error("Acesso somente para administrador.");
    const {data:check,error:lookupError}=await supabaseAdmin.from("visual_audit_checks" as any)
      .select("id,target_url,http_status,checked_at").eq("id",data.checkId)
      .eq("owner_id",context.userId).maybeSingle();
    if(lookupError||!check)throw new Error("Auditoria não encontrada.");
    const url=new URL(String(check.target_url));
    if(url.hostname!=="streammonitor.site"||url.protocol!=="https:"||
      !(["/","/auth","/api/public/health"].includes(url.pathname)||/^\/ajuda\/[a-z0-9-]{2,40}$/.test(url.pathname)))
      throw new Error("Destino não autorizado.");
    if(check.http_status!==null||Date.now()-new Date(check.checked_at).getTime()>5*60*1000)
      return {updated:false};
    const success=data.httpStatus!==null&&data.httpStatus>=200&&data.httpStatus<300&&data.hasExpectedContent;
    const status=success?"partial":data.httpStatus===null?"unavailable":"failed";
    const diagnostic=success?"client_http_only_no_screenshot":data.errorCode==="none"?
      "client_http_unexpected_content_or_status":data.errorCode;
    const {error}=await supabaseAdmin.from("visual_audit_checks" as any).update({
      status,http_status:data.httpStatus,duration_ms:data.durationMs,
      diagnostic,probe_mode:"client_http"
    }).eq("id",data.checkId).eq("owner_id",context.userId).is("http_status",null);
    if(error)throw new Error("Falha ao salvar diagnóstico.");
    return {updated:true,status};
  });
