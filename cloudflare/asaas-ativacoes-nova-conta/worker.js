/**
 * Stream Monitor / AtiveAPP: NEW, dedicated Asaas account (payment rail).
 * No reuse of an existing Asaas integration or Stream Monitor subscription Pix.
 *
 * This build intentionally DOES NOT create customers, charges or activations.
 * A new third-party merchant must authorize use of their Asaas API key.
 * Configure independent secrets in Cloudflare:
 *   ASAAS_ATIVACOES_NOVA_API_KEY          (Secret, Asaas account's access token)
 *   ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN    (Secret, Asaas webhook authToken)
 * These are not interchangeable. Sandbox is the default until authorized.
 *
 * The webhook records minimal event metadata for later reconciliation.
 * A webhook alone never proves payment: verification via Asaas GET /payments/id,
 * account/environment/amount/externalReference, and an idempotent order state
 * transition are necessary before any license activation.
 */
const json = (body,status=200) => new Response(JSON.stringify(body),{
  status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",
    "x-content-type-options":"nosniff"}
});
function safeStr(v,max=128) {
  return typeof v==="string" && v.length>0 && v.length<=max &&
    /^[A-Za-z0-9_:-]+$/.test(v) ? v : null;
}
async function secureEquals(received, expected) {
  if(typeof received!=="string"||typeof expected!=="string"||expected.length<32) return false;
  const te=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",te.encode(received)),
    crypto.subtle.digest("SHA-256",te.encode(expected))]);
  const aa=new Uint8Array(a),bb=new Uint8Array(b);
  let diff=received.length===expected.length?0:1;
  for(let i=0;i<aa.length;i++) diff|=aa[i]^bb[i];
  return diff===0;
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/health"&&request.method==="GET"){
      // Status only; do not reveal the merchant's identity, funds, key or payment details.
      let flags={};
      try{
        if(env.NEW_ASAAS_DB){
          const config=await env.NEW_ASAAS_DB.prepare(
            "SELECT key,value FROM merchant_config WHERE key IN ('environment','merchant_verified',"+
            "'merchant_authorized','payment_creation_enabled','activation_auto_delivery_enabled')"
          ).all();
          flags=Object.fromEntries((config.results||[]).map(r=>[r.key,r.value]));
        }
      }catch{}
      return json({service:"Stream Monitor - Pix de ativações / nova conta Asaas",
        environment:flags.environment||"sandbox",
        credentials_ready:!!env.ASAAS_ATIVACOES_NOVA_API_KEY,
        webhook_auth_ready:!!env.ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN,
        merchant_verified:flags.merchant_verified==="true" && flags.merchant_authorized==="true",
        payment_creation_enabled:false, auto_activation_enabled:false});
    }
    if(url.pathname==="/webhooks/asaas/ativacoes"&&request.method==="POST"){
      if(!env.NEW_ASAAS_DB || !env.ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN)
        return json({error:"webhook_not_configured"},503);
      const auth=request.headers.get("asaas-access-token")||"";
      if(!(await secureEquals(auth,env.ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN)))
        return json({error:"unauthorized"},401);
      const len=Number(request.headers.get("content-length"));
      if(Number.isFinite(len) && len>32000)return json({error:"payload_too_large"},413);
      let text;
      try{text=await request.text()}catch{return json({error:"invalid_body"},400)}
      if(text.length>32000)return json({error:"payload_too_large"},413);
      let data;
      try{data=JSON.parse(text)}catch{return json({error:"invalid_json"},400)}
      const eventId=safeStr(data?.id,120);
      const eventType=safeStr(data?.event,100);
      const paymentId=safeStr(data?.payment?.id,120);
      const reference=safeStr(data?.payment?.externalReference,180);
      const status=safeStr(data?.payment?.status,100);
      if(!eventId||!eventType||!eventType.startsWith("PAYMENT_")||!paymentId)
        return json({error:"invalid_event"},400);
      // Minimal metadata only. Do not persist name, CPF/CNPJ, address or full webhook JSON.
      try{
        const order=await env.NEW_ASAAS_DB.prepare(
          "SELECT order_id FROM pix_orders WHERE asaas_payment_id=? AND external_reference=? LIMIT 1"
        ).bind(paymentId,reference||"").first();
        const result=await env.NEW_ASAAS_DB.prepare(
          "INSERT OR IGNORE INTO pix_webhook_events"+
          "(event_id,event_type,asaas_payment_id,external_reference,payment_status,received_at_ms,reconciliation_status,order_id) "+
          "VALUES(?,?,?,?,?,?,?,?)"
        ).bind(eventId,eventType,paymentId,reference,status,Date.now(),
          order?"pending":"unmatched",order?.order_id||null).run();
        return json({received:true,duplicate:(result.meta?.changes||0)===0});
      }catch{
        return json({error:"temporary_storage_unavailable"},503);
      }
    }
    if(url.pathname==="/webhooks/asaas/ativacoes")return json({error:"method_not_allowed"},405);
    if(url.pathname==="/v1/pix/create"&&request.method==="POST"){
      // Must not contact a merchant nor consume funds until authorized, tested
      // and reconciled with the separate payment ledger.
      return json({error:"nova_conta_asaas_em_configuracao",charged:false},503);
    }
    return json({error:"not_found"},404);
  }
};
