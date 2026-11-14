/**
 * Privacy-minimal PostHog analytics without SDK or session recordings.
 * Captures only allowlisted events, sanitized page categories and a random
 * per-session ID (no email, name, DNS, host, IPTV credentials, full URLs or IPs).
 *
 * No requests leave the browser until an admin enables a valid project and
 * analytics consent allows capture. PostHog project tokens are public/write-only.
 */
import {canTrack} from "@/lib/consent";
import {getPublicPosthogConfig} from "@/lib/observability.functions";

type Config={enabled:boolean;projectKey:string;host:string};
let configPromise:Promise<Config>|null=null;
let lastPath="";
const SAFE_HOSTS=new Set(["streammonitor.site","www.streammonitor.site"]);
const EVENTS=new Set([
  "sm_signup_started","sm_signup_completed","sm_login_completed",
  "sm_subscription_started","sm_feature_opened",
]);
async function config():Promise<Config>{
  if(!configPromise){
    configPromise=getPublicPosthogConfig().catch(()=>{
      configPromise=null;
      return {enabled:false,projectKey:"",host:""};
    });
  }
  return configPromise;
}
function visitor(){
  try{
    let value=sessionStorage.getItem("sm_analytics_session");
    if(!value || !/^[0-9a-f-]{36}$/.test(value)){
      value=crypto.randomUUID();
      sessionStorage.setItem("sm_analytics_session",value);
    }
    return value;
  }catch {
    return crypto.randomUUID();
  }
}
async function dispatch(event:string,properties:Record<string,string>){
  if(typeof window==="undefined" || !SAFE_HOSTS.has(location.hostname))return false;
  if(!(await canTrack("analytics")))return false;
  const c=await config();
  if(!c.enabled || !/^phc_[A-Za-z0-9_-]{12,150}$/.test(c.projectKey)
    || !["https://us.i.posthog.com","https://eu.i.posthog.com"].includes(c.host))return false;
  try {
    const response=await fetch(`${c.host}/i/v0/e/`,{
      method:"POST",headers:{"Content-Type":"application/json"},mode:"cors",
      keepalive:true,
      body:JSON.stringify({
        api_key:c.projectKey,
        event,
        distinct_id:visitor(),
        properties:{
          ...properties,
          $ip:null,
          $process_person_profile:false,
          app_name:"Stream Monitor",
        },
      }),
      signal:AbortSignal.timeout(4000),
    });
    return response.ok;
  }catch { return false; }
}
function normalizeScreen(path:string):string|null {
  if(path==="/")return "home";
  if(path==="/auth")return "cadastro_login";
  if(path==="/blog" || path.startsWith("/blog/"))return "blog";
  if(path==="/revendedor-stream-monitor")return "revendedores";
  if(path==="/app")return "dashboard";
  if(path==="/app/servers")return "servidores";
  if(path==="/app/servers/new")return "novo_servidor";
  if(path.startsWith("/app/servers/"))return "detalhe_servidor";
  if(path==="/app/alerts")return "alertas";
  if(path==="/app/radar")return "radar";
  if(path==="/app/falhas")return "radar_falhas";
  if(path==="/app/subscription")return "assinatura";
  if(path==="/vitrine-ai")return "vitrine_ia";
  if(path==="/vitrine-banner")return "vitrine_banner";
  return null;
}
export async function trackPosthogPage(path:string){
  if(path===lastPath)return;
  const screen=normalizeScreen(path);
  if(!screen)return;
  const publicPage=!path.startsWith("/app")&&!path.startsWith("/vitrine");
  const props={screen,scope:publicPage?"publico":"painel"};
  const ok=await dispatch(
    publicPage?"$pageview":"sm_feature_opened",
    publicPage?{...props,$current_url:`https://streammonitor.site${path}`}:props
  );
  if(ok)lastPath=path;
}
export async function trackPosthogEvent(event:string){
  if(!EVENTS.has(event))return;
  await dispatch(event,{});
}
