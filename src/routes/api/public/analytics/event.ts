import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";

/**
 * Anonymous, consent-gated first-party analytics. The browser supplies
 * ONLY a random per-session UUID, whitelisted event and screen names.
 * Do not log raw payloads, client IPs, headers, paths or referrers.
 */
const input=z.object({
  sessionId:z.string().uuid(),
  event:z.enum([
    "$pageview","sm_feature_opened","sm_signup_started",
    "sm_signup_completed","sm_login_completed","sm_subscription_started",
  ]),
  screen:z.enum([
    "home","cadastro_login","blog","revendedores","dashboard","servidores",
    "novo_servidor","detalhe_servidor","alertas","radar","radar_falhas",
    "assinatura","vitrine_ia","vitrine_banner","none",
  ]),
  scope:z.enum(["publico","painel"]),
}).strict();

export const Route=createFileRoute("/api/public/analytics/event")({
  server:{handlers:{POST:async({request})=>{
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
      return Response.json({ok:false},{status:415});
    const origin=request.headers.get("origin");
    if(origin && !["https://streammonitor.site","https://www.streammonitor.site"].includes(origin))
      return Response.json({ok:false},{status:403});
    const site=request.headers.get("sec-fetch-site");
    if(site && !["same-origin","none"].includes(site))
      return Response.json({ok:false},{status:403});
    const body=await request.text();
    if(body.length>700)return Response.json({ok:false},{status:413});
    let parsed:unknown;
    try{parsed=JSON.parse(body)}catch{return Response.json({ok:false},{status:400})}
    const clean=input.safeParse(parsed);
    if(!clean.success)return Response.json({ok:false},{status:400});
    try{
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const {error}=await (supabaseAdmin as any).rpc("streammonitor_record_analytics_event",{
        p_session:clean.data.sessionId,p_event:clean.data.event,
        p_screen:clean.data.screen,p_scope:clean.data.scope,
      });
      if(error)return Response.json({ok:false},{status:503});
      return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
    }catch{return Response.json({ok:false},{status:503})}
  }}},
});
