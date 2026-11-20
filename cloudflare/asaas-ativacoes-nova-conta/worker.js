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
    "x-content-type-options":"nosniff",
    "x-frame-options":"DENY","referrer-policy":"no-referrer",
    "content-security-policy":"default-src 'none'; frame-ancestors 'none'"}
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
async function probeProviderReadOnly(env) {
  if(!env.NEW_ASAAS_DB)return;
  const key=env.ASAAS_ATIVACOES_NOVA_API_KEY;
  const prefix=typeof key==="string" && key.startsWith("$aact_prod_")?"production":
    typeof key==="string" && key.startsWith("$aact_hmlg_")?"sandbox":"unknown";
  const base=prefix==="production"?"https://api.asaas.com/v3":
    prefix==="sandbox"?"https://api-sandbox.asaas.com/v3":null;
  const now=Date.now();
  // Never log or persist the key, body of account response or sensitive webhook fields.
  let apiStatus=0, webhookStatus=0, match=false, enabled=false, error="none";
  if(!base||!key)error="invalid_key_format";
  else{
    const headers={"access_token":key,"User-Agent":"StreamMonitor-Integracoes/1.0",
      "Accept":"application/json"};
    try{
      const [account,webhooks]=await Promise.all([
        fetch(base+"/myAccount/status/",{method:"GET",headers,signal:AbortSignal.timeout(9500),
          cf:{cacheTtl:0,cacheEverything:false}}),
        fetch(base+"/webhooks?limit=100",{method:"GET",headers,signal:AbortSignal.timeout(9500),
          cf:{cacheTtl:0,cacheEverything:false}})
      ]);
      apiStatus=account.status;
      webhookStatus=webhooks.status;
      if(webhooks.ok){
        const data=await webhooks.json().catch(()=>null);
        const rows=Array.isArray(data?.data)?data.data:
          Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
        const targets=new Set([
          "https://streammonitor-asaas-ativacoes-nova-conta.victorsampaio133.workers.dev/webhooks/asaas/ativacoes",
          "https://pagamentos.streammonitor.site/eventos/pagamentos"
        ]);
        for(const row of rows){
          if(typeof row?.url==="string" && targets.has(row.url.trim())){
            match=true;
            enabled=enabled || row.enabled===true || row.enabled==="true";
          }
        }
      }
      if(!account.ok)error=account.status===401?"invalid_key":"account_api_error";
      else if(!webhooks.ok)error=webhooks.status===401?"invalid_key":"webhook_query_failed";
    }catch{error="connection_failed";}
  }
  const info={
    "provider_key_env_detected":prefix,
    "provider_account_http_status":String(apiStatus),
    "provider_webhook_list_http_status":String(webhookStatus),
    "provider_webhook_url_present":String(match),
    "provider_webhook_enabled":String(enabled),
    "provider_probe_result":error,
    "provider_checked_at_ms":String(now)
  };
  const statements=Object.entries(info).map(([k,v])=>
    env.NEW_ASAAS_DB.prepare(
      "INSERT INTO merchant_config(key,value,updated_at_ms) VALUES(?,?,?) "+
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at_ms=excluded.updated_at_ms"
    ).bind(k,v,now)
  );
  await env.NEW_ASAAS_DB.batch(statements);
}

const AUTH_URL="https://yiwyfiaqehhmngqngxvx.supabase.co/auth/v1/user";
const SITE_ORIGINS=new Set(["https://streammonitor.site","https://www.streammonitor.site"]);
function financialHeaders(origin){
  return SITE_ORIGINS.has(origin)?{
    "access-control-allow-origin":origin,
    "access-control-allow-methods":"GET,POST,OPTIONS",
    "access-control-allow-headers":"authorization,content-type,x-sm-public-key",
    "access-control-max-age":"600","vary":"Origin",
  }:{"vary":"Origin"};
}
function checkoutReply(body,status,origin){
  const response=json(body,status);
  for(const [k,v] of Object.entries(financialHeaders(origin)))response.headers.set(k,v);
  return response;
}
async function authenticatedOwner(request){
  const jwt=request.headers.get("authorization")||"";
  const key=request.headers.get("x-sm-public-key")||"";
  if(!/^Bearer [A-Za-z0-9._-]{30,8192}$/.test(jwt)||
    !/^[A-Za-z0-9._-]{15,4096}$/.test(key))return null;
  const res=await fetch(AUTH_URL,{method:"GET",headers:{"Authorization":jwt,"apikey":key},
    signal:AbortSignal.timeout(7000),cf:{cacheTtl:0,cacheEverything:false}});
  if(!res.ok)return null;
  const account=await res.json().catch(()=>null);
  return /^[a-f0-9-]{36}$/i.test(account?.id||"")?account.id:null;
}
function uuid(value){return typeof value==="string"&&/^[a-f0-9-]{36}$/i.test(value);}
function macAddress(value){
  if(typeof value!=="string"||value.length>64)return null;
  const hex=value.trim().toUpperCase().replace(/[:-]/g,"");
  if(!/^[A-F0-9]{12}$/.test(hex)||/^(0{12}|F{12})$/.test(hex))return null;
  return hex.match(/.{2}/g).join(":");
}
function asaasHost(env){
  const key=env.ASAAS_ATIVACOES_NOVA_API_KEY;
  return typeof key==="string"&&key.startsWith("$aact_prod_")?
    "https://api.asaas.com/v3":
    typeof key==="string"&&key.startsWith("$aact_hmlg_")?
    "https://api-sandbox.asaas.com/v3":null;
}
async function paymentCall(env, path, options={}){
  const base=asaasHost(env);
  if(!base)throw new Error("no_gateway");
  const res=await fetch(base+path,{
    method:options.method||"GET",
    headers:{"access_token":env.ASAAS_ATIVACOES_NOVA_API_KEY,"accept":"application/json",
      "User-Agent":"StreamMonitor-Integracoes/1.0",
      ...(options.body?{"content-type":"application/json"}:{})},
    body:options.body?JSON.stringify(options.body):undefined,
    signal:AbortSignal.timeout(12000),
    cf:{cacheTtl:0,cacheEverything:false},
  });
  const data=await res.json().catch(()=>null);
  if(!res.ok)throw new Error("gateway_http_"+res.status);
  return data;
}
async function merchantReady(env){
  if(!env.NEW_ASAAS_DB||!env.APP_DB||!env.ASAAS_ATIVACOES_NOVA_API_KEY||
     !env.ACTIVATION_SERVICE)return false;
  const r=await env.NEW_ASAAS_DB.prepare(
    "SELECT key,value FROM merchant_config WHERE key IN ("+
    "'merchant_authorized','merchant_verified','payment_creation_enabled',"+
    "'activation_auto_delivery_enabled','environment','provider_key_env_detected',"+
    "'provider_account_http_status','provider_webhook_url_present','provider_webhook_enabled')"
  ).all();
  const flags=Object.fromEntries((r.results||[]).map(x=>[x.key,x.value]));
  return flags.merchant_authorized==="true"&&flags.merchant_verified==="true"&&
    flags.payment_creation_enabled==="true"&&flags.activation_auto_delivery_enabled==="true"&&
    flags.environment===flags.provider_key_env_detected&&
    flags.provider_account_http_status==="200"&&
    flags.provider_webhook_url_present==="true"&&
    flags.provider_webhook_enabled==="true";
}
function safeCents(v){return Number.isSafeInteger(v)&&v>=100&&v<=999999;}
function dueDate(){
  const current=new Date(Date.now()+24*60*60_000);
  const fields=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Fortaleza",year:"numeric",
    month:"2-digit",day:"2-digit"}).formatToParts(current);
  const part=k=>fields.find(p=>p.type===k)?.value||"";
  return part("year")+"-"+part("month")+"-"+part("day");
}
async function createCheckout(env,userId,input){
  if(!await merchantReady(env))return{status:503,body:{error:"checkout_indisponivel",charged:false}};
  const appId=typeof input?.appId==="string"&&/^[A-Za-z0-9_-]{5,90}$/.test(input.appId)?
    input.appId:null;
  const mac=macAddress(input?.mac);
  const token=uuid(input?.requestId)?input.requestId:null;
  const name=typeof input?.payerName==="string"?input.payerName.trim().slice(0,100):"";
  const email=typeof input?.payerEmail==="string"?input.payerEmail.trim().toLowerCase():"";
  const cpfCnpj=typeof input?.cpfCnpj==="string"?input.cpfCnpj.replace(/\D/g,""):"";
  if(!appId||!mac||!token||input?.acknowledged!==true||name.length<3||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||![11,14].includes(cpfCnpj.length))
    return {status:400,body:{error:"Confira nome, CPF/CNPJ, e-mail, aplicativo e MAC.",charged:false}};
  const db=env.NEW_ASAAS_DB;
  let order=await db.prepare(
    "SELECT * FROM pix_orders WHERE owner_user_id=? AND idempotency_token=?"
  ).bind(userId,token).first();
  if(order){
    if(order.app_id!==appId||order.mac_normalized!==mac)
      return {status:409,body:{error:"Esta solicitação já foi usada para outros dados.",charged:false}};
    return {status:200,body:await summarizeOrder(env,order,true)};
  }
  const app=await env.APP_DB.prepare(
    "SELECT app_id,name,sale_price_cents AS cents FROM app_catalog WHERE app_id=? AND is_active=1 AND sale_price_cents>=100"
  ).bind(appId).first();
  if(!app||!safeCents(app.cents))
    return{status:404,body:{error:"Aplicativo sem preço válido.",charged:false}};
  const existing=await db.prepare(
    "SELECT * FROM pix_orders WHERE owner_user_id=? AND app_id=? AND mac_normalized=? "+
    "AND created_at_ms>? AND status IN('prepared','creating_customer','creating_payment',"+
    "'awaiting_payment','paid_pending_activation','activated','needs_review') "+
    "ORDER BY created_at_ms DESC LIMIT 1"
  ).bind(userId,appId,mac,Date.now()-15*60_000).first();
  if(existing)return{status:200,body:await summarizeOrder(env,existing,true)};
  const count=await db.prepare(
    "SELECT COUNT(*) AS n FROM pix_orders WHERE owner_user_id=? AND created_at_ms>?"
  ).bind(userId,Date.now()-3600_000).first();
  if(Number(count?.n||0)>=4)return{status:429,body:{error:"Limite de pedidos. Tente mais tarde.",charged:false}};
  const orderId=crypto.randomUUID(),now=Date.now();
  const environment=asaasHost(env).includes("sandbox")?"sandbox":"production";
  const write=await db.prepare(
    "INSERT OR IGNORE INTO pix_orders(order_id,activation_request_id,owner_user_id,app_id,"+
    "mac_normalized,amount_cents,asaas_environment,merchant_fingerprint,external_reference,"+
    "status,created_at_ms,updated_at_ms,idempotency_token) "+
    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(orderId,orderId,userId,appId,mac,app.cents,environment,
    "merchant_verified",orderId,"prepared",now,now,token).run();
  if(!write.meta?.changes)return{status:409,body:{error:"Pedido em andamento.",charged:false}};
  try{
    let customer=await db.prepare(
      "SELECT asaas_customer_id FROM customer_bindings WHERE owner_user_id=? AND environment=?"+
      " AND merchant_fingerprint='merchant_verified'"
    ).bind(userId,environment).first();
    let customerId=customer?.asaas_customer_id;
    if(!customerId){
      await db.prepare("UPDATE pix_orders SET status='creating_customer',updated_at_ms=? WHERE order_id=?")
        .bind(Date.now(),orderId).run();
      // Only the payment provider receives CPF, name and email; never store them in D1.
      const created=await paymentCall(env,"/customers",{method:"POST",body:{
        name,cpfCnpj,email,externalReference:"sm-app-"+userId,notificationDisabled:true,
      }});
      if(typeof created?.id!=="string"||!created.id.startsWith("cus_"))throw new Error("bad_customer_response");
      customerId=created.id;
      await db.prepare(
        "INSERT OR IGNORE INTO customer_bindings(owner_user_id,asaas_customer_id,environment,merchant_fingerprint,created_at_ms) VALUES(?,?,?,?,?)"
      ).bind(userId,customerId,environment,"merchant_verified",Date.now()).run();
    }
    // From here on any timeout has an uncertain charge creation outcome.
    await db.prepare("UPDATE pix_orders SET status='creating_payment',asaas_customer_id=?,updated_at_ms=? WHERE order_id=?")
      .bind(customerId,Date.now(),orderId).run();
    const charged=await paymentCall(env,"/payments",{method:"POST",body:{
      customer:customerId,billingType:"PIX",value:app.cents/100,dueDate:dueDate(),
      description:"Licença de aplicativo - "+app.name.slice(0,60),
      externalReference:orderId,postalService:false
    }});
    if(!/^pay_[A-Za-z0-9_-]+$/.test(charged?.id||""))throw new Error("bad_payment_response");
    await db.prepare(
      "UPDATE pix_orders SET status='awaiting_payment',asaas_payment_id=?,updated_at_ms=? WHERE order_id=? AND status='creating_payment'"
    ).bind(charged.id,Date.now(),orderId).run();
    const current=await db.prepare("SELECT * FROM pix_orders WHERE order_id=?").bind(orderId).first();
    return{status:201,body:await summarizeOrder(env,current,true)};
  }catch(e){
    await db.prepare(
      "UPDATE pix_orders SET status='needs_review',updated_at_ms=?,last_error_code=? WHERE order_id=?"
    ).bind(Date.now(),String(e?.message||"gateway_failed").slice(0,60),orderId).run().catch(()=>{});
    return{status:503,body:{error:"Não foi possível concluir a emissão do Pix. Pedido em análise; não repita a compra.",orderId,charged:false}};
  }
}
async function summarizeOrder(env,order,withQr=false){
  const status=order.supplier_state==="accepted"?"submitted":
    order.supplier_state==="needs_review"?"needs_review":order.status;
  const data={orderId:order.order_id,appId:order.app_id,mac:order.mac_normalized,
    amountCents:order.amount_cents,status,supplierState:order.supplier_state,
    expiresAt:order.pix_expires_at||null,
    pix:order.status==="awaiting_payment"?order.pix_payload||null:null};
  if(withQr&&order.status==="awaiting_payment"&&order.asaas_payment_id){
    try{
      const qr=await paymentCall(env,"/payments/"+encodeURIComponent(order.asaas_payment_id)+"/pixQrCode");
      data.pix=typeof qr?.payload==="string"?qr.payload:data.pix;
      data.qrImage=typeof qr?.encodedImage==="string"&&qr.encodedImage.length<50000?
        qr.encodedImage:null;
      data.expiresAt=qr?.expirationDate||data.expiresAt;
      if(data.pix&&!order.pix_payload)await env.NEW_ASAAS_DB.prepare(
        "UPDATE pix_orders SET pix_payload=?,pix_expires_at=?,updated_at_ms=? WHERE order_id=?"
      ).bind(data.pix,data.expiresAt||null,Date.now(),order.order_id).run();
    }catch{}
  }
  return data;
}
async function reconcilePaidPayment(env,orderId){
  const db=env.NEW_ASAAS_DB;
  const o=await db.prepare("SELECT * FROM pix_orders WHERE order_id=?").bind(orderId).first();
  if(!o||!o.asaas_payment_id||!o.asaas_customer_id)return;
  if(["activated","cancelled","refunded"].includes(o.status))return;
  const p=await paymentCall(env,"/payments/"+encodeURIComponent(o.asaas_payment_id));
  if(p?.id!==o.asaas_payment_id||p?.externalReference!==o.external_reference||
    p?.customer!==o.asaas_customer_id||p?.billingType!=="PIX"||
    Math.round(Number(p?.value)*100)!==o.amount_cents){
    await db.prepare(
      "UPDATE pix_orders SET status='needs_review',last_error_code='payment_mismatch',updated_at_ms=? WHERE order_id=?"
    ).bind(Date.now(),orderId).run();
    return;
  }
  if(p.status==="REFUNDED"||p.status==="CHARGEBACK_REQUESTED"){
    await db.prepare("UPDATE pix_orders SET status='needs_review',last_error_code='refunded_or_disputed',updated_at_ms=? WHERE order_id=?")
      .bind(Date.now(),orderId).run();return;
  }
  if(p.status!=="RECEIVED")return;
  if(o.supplier_state!=="not_submitted")return;
  const now=Date.now();
  await db.prepare(
    "UPDATE pix_orders SET status='paid_pending_activation',paid_at_ms=?,last_payment_check_at_ms=?,updated_at_ms=?"+
    " WHERE order_id=? AND status IN('awaiting_payment','confirmed','received') AND supplier_state='not_submitted'"
  ).bind(now,now,now,orderId).run();
  // Claim the one-and-only supplier submission before the external API call.
  const nonce=crypto.randomUUID();
  const claim=await db.prepare(
    "UPDATE pix_orders SET supplier_state='submitting',fulfill_nonce=?,updated_at_ms=?"+
    " WHERE order_id=? AND status='paid_pending_activation' AND supplier_state='not_submitted'"
  ).bind(nonce,Date.now(),orderId).run();
  if(!claim.meta?.changes)return;
  try{
    const res=await env.ACTIVATION_SERVICE.fetch("https://private.internal/internal/paid-activation",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({orderId,nonce}),
    });
    const body=await res.json().catch(()=>null);
    if(res.status===202 && body?.accepted===true){
      await db.prepare(
        "UPDATE pix_orders SET supplier_state='accepted',updated_at_ms=? WHERE order_id=?"
      ).bind(Date.now(),orderId).run();
    }else{
      await db.prepare(
        "UPDATE pix_orders SET supplier_state='needs_review',status='needs_review',last_error_code='supplier_not_accepted',updated_at_ms=? WHERE order_id=?"
      ).bind(Date.now(),orderId).run();
    }
  }catch{
    await db.prepare(
      "UPDATE pix_orders SET supplier_state='needs_review',status='needs_review',last_error_code='supplier_network_unknown',updated_at_ms=? WHERE order_id=?"
    ).bind(Date.now(),orderId).run();
  }
}

export default {
  async scheduled(_event,env,ctx){
    ctx.waitUntil(probeProviderReadOnly(env).catch(()=>{}));
  },
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const origin=request.headers.get("origin")||"";
    if(request.method==="OPTIONS"){
      return SITE_ORIGINS.has(origin)?
        new Response(null,{status:204,headers:financialHeaders(origin)}):
        new Response(null,{status:403});
    }
    if(origin&&!SITE_ORIGINS.has(origin))return checkoutReply({error:"forbidden_origin"},403,origin);
    if(url.pathname.startsWith("/v1/pix/")){
      let userId;
      try{userId=await authenticatedOwner(request)}catch{return checkoutReply({error:"auth_unavailable"},503,origin)}
      if(!userId)return checkoutReply({error:"Entre novamente na sua conta."},401,origin);
      if(request.method==="POST"&&url.pathname==="/v1/pix/create"){
        const data=await request.json().catch(()=>null);
        const result=await createCheckout(env,userId,data);
        return checkoutReply(result.body,result.status,origin);
      }
      if(request.method==="GET"&&url.pathname==="/v1/pix/status"){
        const id=url.searchParams.get("orderId");
        if(!uuid(id))return checkoutReply({error:"Pedido inválido."},400,origin);
        const order=await env.NEW_ASAAS_DB.prepare(
          "SELECT * FROM pix_orders WHERE order_id=? AND owner_user_id=?"
        ).bind(id,userId).first();
        if(!order)return checkoutReply({error:"Pedido não encontrado."},404,origin);
        // Throttle paid status reconciliation. Never poll payment gateway every UI re-render.
        if(order.status==="awaiting_payment" &&
          Date.now()-Number(order.last_payment_check_at_ms||0)>45000){
          await env.NEW_ASAAS_DB.prepare(
            "UPDATE pix_orders SET last_payment_check_at_ms=? WHERE order_id=?"
          ).bind(Date.now(),id).run();
          if(ctx?.waitUntil)ctx.waitUntil(reconcilePaidPayment(env,id).catch(()=>{}));
        }
        const fresh=await env.NEW_ASAAS_DB.prepare(
          "SELECT * FROM pix_orders WHERE order_id=? AND owner_user_id=?"
        ).bind(id,userId).first();
        return checkoutReply(await summarizeOrder(env,fresh,false),200,origin);
      }
      return checkoutReply({error:"not_found"},404,origin);
    }
    if(url.pathname==="/health"&&request.method==="GET"){
      // Public probe must not reveal provider, credential status, environment or merchant data.
      return json({status:"ok"});
    }
    const isWebhook=url.pathname==="/webhooks/asaas/ativacoes" ||
      url.pathname==="/eventos/pagamentos";
    if(isWebhook&&request.method==="POST"){
      if(!env.NEW_ASAAS_DB || !env.ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN)
        return json({error:"webhook_not_configured"},503);
      const auth=request.headers.get("asaas-access-token")||"";
      if(!(await secureEquals(auth,env.ASAAS_ATIVACOES_NOVA_WEBHOOK_TOKEN)))
        return json({error:"unauthorized"},401);
      const len=Number(request.headers.get("content-length"));
      if(Number.isFinite(len) && len>32000)return json({error:"payload_too_large"},413);
      // Enforce a byte limit before buffering any untrusted webhook payload.
      let data;
      try{
        if(!request.body)return json({error:"invalid_body"},400);
        const reader=request.body.getReader(), chunks=[];
        let length=0;
        while(true){
          const next=await reader.read();
          if(next.done)break;
          length+=next.value.byteLength;
          if(length>32000){
            await reader.cancel().catch(()=>{});
            return json({error:"payload_too_large"},413);
          }
          chunks.push(next.value);
        }
        const body=new Uint8Array(length);
        let offset=0;
        for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
        data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(body));
      }catch{return json({error:"invalid_json"},400)}
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
        if(order && ctx?.waitUntil && (eventType==="PAYMENT_RECEIVED"||
          eventType==="PAYMENT_CONFIRMED"))
          ctx.waitUntil(reconcilePaidPayment(env,order.order_id).catch(()=>{}));
        return json({received:true,duplicate:(result.meta?.changes||0)===0});
      }catch{
        return json({error:"temporary_storage_unavailable"},503);
      }
    }
    if(isWebhook)return json({error:"method_not_allowed"},405);

    return json({error:"not_found"},404);
  }
};
