import {supabaseAdmin} from "@/integrations/supabase/client.server";

/** Cloudflare Email Sending (Workers Paid). Backend-only transactional welcome.
 * The API token must exist as a SERVER secret:
 * CLOUDFLARE_EMAIL_API_TOKEN (Email Sending: Write, restricted to this account).
 * Never put the token in VITE_ vars, client bundles or the public database.
 */
const accountId="f31c1db2068b71744f648fd74ab30924";
const from="notificacoes@notify.streammonitor.site";
const checkoutUrl="https://streammonitor.site/app/subscription";
const htmlEscape=(v:string)=>v.replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]||c);

export async function sendSignupPaymentEmail(args:{
 userId:string;email:string;name:string;
}):Promise<"sent"|"skipped"|"failed">{
 // No secret configured = no outbound requests. Never block registration.
 const token=process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
 if(!token)return "skipped";
 const email=args.email.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return "skipped";

 // An account with an active subscription or active referral trial should
 // never receive a "you still need to pay" request.
 const {data:sub,error:subErr}=await (supabaseAdmin as any).from("subscriptions")
   .select("status,expires_at").eq("user_id",args.userId).maybeSingle();
 if(subErr)return "failed";
 if(sub&&["active","trial"].includes(sub.status)&&
    Number.isFinite(Date.parse(sub.expires_at))&&Date.parse(sub.expires_at)>Date.now())
   return "skipped";

 // Atomic unique claim. A retry of signup, webhook or registration handler
 // never sends the same welcome email twice to the same user.
 const db=supabaseAdmin as any;
 const claim=await db.from("signup_payment_email_log").insert({
  user_id:args.userId,email,status:"sending"
 }).select("user_id").single();
 if(claim.error){
   if(claim.error.code==="23505")return "skipped";
   return "failed";
 }
 const name=htmlEscape(args.name.trim().slice(0,80)||"cliente");
 const greeting=(args.name.trim().slice(0,80)||"cliente").replace(/[\r\n]/g," ");
 const subject="Seu Stream Monitor está pronto para ativar 🚀";
 const text=`Olá, ${greeting}!

Seu cadastro no Stream Monitor foi realizado! Explore uma prévia do painel para conhecer o que você poderá fazer.

Com sua assinatura ativa, você terá:
• Monitoramento de DNS, HTTP, SSL e servidores IPTV;
• Alertas automáticos de falhas e recuperação no Telegram;
• Diagnósticos inteligentes e histórico de incidentes;
• Ferramentas de divulgação: Vitrine IA, banners de futebol e vídeos personalizados.

O plano mensal começa em R$ 25 por 30 dias. Veja também as demais opções no painel. O pagamento é por Pix, diretamente no site, e o acesso é liberado após a confirmação.

Entre na sua conta e escolha o plano:
${checkoutUrl}

Se precisar confirmar o e-mail da conta antes de entrar, confira a mensagem de verificação enviada no cadastro.
Se já pagou, ignore este convite. Nunca informe senha ou dados bancários em resposta a este e-mail.

Equipe Stream Monitor — https://streammonitor.site`;
 const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="margin:0;background:#071327;padding:25px 12px;font-family:Arial,sans-serif;color:#ecf4ff"><div style="max-width:580px;margin:0 auto;border-radius:20px;overflow:hidden;border:1px solid #2a5cb2;background:#102443"><div style="padding:28px;background:#092b63"><div style="color:#67d4ff;font-size:12px;font-weight:800;letter-spacing:2px">STREAM MONITOR</div><h1 style="margin:18px 0 10px;font-size:29px;color:#fff">Seu cadastro foi realizado! 🚀</h1><p style="color:#d7e8ff;font-size:16px;line-height:1.6">Olá, ${name}! Seu acesso de demonstração está disponível para conhecer as ferramentas antes de assinar.</p></div><div style="padding:26px"><h2 style="font-size:18px;color:#fff">O que você terá acesso após ativar</h2><ul style="padding-left:22px;font-size:15px;line-height:2;color:#d7e8ff"><li>Monitoramento de DNS, HTTP, SSL e IPTV</li><li>Alertas e notificações no Telegram</li><li>Diagnósticos inteligentes e histórico</li><li>Vitrine IA, banners de futebol e vídeos para revendas</li></ul><p style="color:#d7e8ff;line-height:1.7">Plano mensal a partir de <strong style="color:#fff">R$ 25</strong>, por 30 dias. O Pix é gerado diretamente no painel. Você ativa a conta após a confirmação do pagamento.</p><a href="${checkoutUrl}" style="display:block;padding:16px;margin:24px 0;text-align:center;border-radius:12px;background:#287bfa;color:white;text-decoration:none;font-size:16px;font-weight:bold">CONHECER PLANOS E ATIVAR CONTA</a><p style="font-size:13px;color:#abc2df;line-height:1.5">O botão abre o site oficial. Entre com seu login. Se precisar confirmar seu e-mail, confira antes a mensagem de verificação. Se já pagou, desconsidere este convite. Nunca informe sua senha por e-mail.</p></div><div style="padding:16px;border-top:1px solid #31517d;text-align:center;color:#9bb4d8;font-size:12px">Stream Monitor • streammonitor.site</div></div></body></html>`;
 let status:"sent"|"failed"="failed";
 let messageId:string|null=null,errorCode:string|null=null;
 try{
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,{
   method:"POST",
   signal:AbortSignal.timeout(9000),
   headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
   body:JSON.stringify({
    from:{address:from,name:"Stream Monitor"},
    to:{address:email,name:greeting},
    subject,text,html
   })
  });
  const result=await response.json() as {success?:boolean;result?:{id?:string;message_id?:string;messageId?:string}};
  if(response.ok&&result.success){
   status="sent";
   messageId=result.result?.message_id||result.result?.messageId||result.result?.id||null;
  }else{errorCode="cf_http_"+response.status;}
 }catch(e){
  errorCode=e instanceof Error?e.name.slice(0,80):"fetch_failed";
 }
 await db.from("signup_payment_email_log").update({
  status,error_code:errorCode,message_id:messageId,
  sent_at:status==="sent"?new Date().toISOString():null,
  updated_at:new Date().toISOString(),
 }).eq("user_id",args.userId);
 return status;
}
