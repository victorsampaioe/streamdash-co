/**
 * Stream Monitor — AtiveAPP API (Cloudflare Workers + D1)
 *
 * SECURITY: All paid activations stay disabled until the API key, retail
 * pricing, account billing, idempotent debit and provider reconciliation
 * have been verified. This Worker never exposes the provider key.
 *
 * A license activates a player only; it does not supply video content.
 */
const PROVIDER = "https://api.ativeapp.com";
const AUTH_BASE = "https://yiwyfiaqehhmngqngxvx.supabase.co";
const ORIGINS = new Set(["https://streammonitor.site", "https://www.streammonitor.site"]);
const corsHeaders = (origin) => ({
  "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://streammonitor.site",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-sm-public-key",
  "access-control-max-age": "600",
  "cache-control": "no-store",
  "vary": "Origin",
  "x-content-type-options": "nosniff",
});
function respond(body, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}
function genericError(status) {
  if (status === 401) return "Sessão expirada. Entre novamente.";
  if (status === 403) return "Acesso não autorizado.";
  return "Não foi possível consultar as ativações. Tente novamente.";
}
async function userFromRequest(request) {
  const bearer = request.headers.get("Authorization") || "";
  const key = request.headers.get("x-sm-public-key") || "";
  if (!/^Bearer [A-Za-z0-9._-]{30,8192}$/.test(bearer)) return null;
  if (!/^[A-Za-z0-9._-]{15,4096}$/.test(key)) return null;
  const response = await fetch(AUTH_BASE + "/auth/v1/user", {
    headers: { "Authorization": bearer, "apikey": key },
    signal: AbortSignal.timeout(7000),
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return typeof data?.id === "string" && /^[0-9a-f-]{36}$/i.test(data.id)
    ? data.id : null;
}
const appIdOk = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{5,90}$/.test(s);
function cleanMac(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().toUpperCase().replace(/-/g, ":");
  if (/^[0-9A-F]{12}$/.test(raw)) return raw.match(/.{2}/g).join(":");
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(raw) ? raw : null;
}
// Logos are optional in the upstream API. Do not invent image links.
function validLogoUrl(value) {
  const str = typeof value === "string" ? value : value && typeof value === "object"
    ? (value.url || value.src || value.imagem || value.logo) : "";
  if (typeof str !== "string" || str.length > 1024) return null;
  try {
    const u = new URL(str.trim().startsWith("//") ? "https:" + str.trim() : str.trim());
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname || /(?:^|\.)(?:localhost|local|internal)$/.test(u.hostname)) return null;
    if (/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
}
function providerLogo(app) {
  for (const key of ["logo_do_app","tumbnail_telegram","logo_url","logoUrl","imagem_url","image_url","icon_url","foto_url",
    "logo","imagem","image","icon","icone","foto","logotipo","imagem_app","foto_app","img"]) {
    const value = validLogoUrl(app?.[key]);
    if (value) return value;
  }
  return null;
}
const parseApps = (body) => {
  const candidates = Array.isArray(body) ? body :
    [body?.items, body?.aplicativos, body?.data, body?.results, body?.lista]
      .find(Array.isArray) || [];
  return candidates.slice(0, 200).flatMap((app) => {
    // Vendor's field is called "app_uuid" at checkout but expects "id",
    // never "uuid". Keep the upstream id as an opaque string.
    const id = String(app?.id ?? "");
    const name = String(app?.aplicativos ?? app?.nome ?? app?.name ?? "").trim();
    if (!appIdOk(id) || !name || name.length > 150) return [];
    const cost = Number(app?.valor);
    const storeRaw = app?.valor_da_loja;
    const store = typeof storeRaw === "number" ? storeRaw :
      (typeof storeRaw === "string" ? Number(storeRaw.trim().replace(",", ".")) : NaN);
    return [{
      id, name, module: String(app?.modulo ?? app?.module ?? "").slice(0,80),
      cost: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 100) : null,
      storePrice: Number.isFinite(store) && store >= 0 && store <= 100000 ? Math.round(store * 100) : null,
      logoUrl: providerLogo(app),
    }];
  });
};
async function catalogSyncMeta(db, fields) {
  const stamp = Date.now();
  const statements = Object.entries(fields).map(([key,value]) =>
    db.prepare("INSERT INTO activation_config(key,value,updated_at_ms) VALUES (?,?,?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at_ms=excluded.updated_at_ms")
      .bind(key,String(value),stamp)
  );
  if (statements.length) await db.batch(statements);
}
async function refreshCatalog(env, options = {}) {
  if (!env.ATIVEAPP_API_KEY || !env.APP_DB) return { configured: false, refreshed: false };
  // Only a complete multi-page scan is considered fresh. The previous version
  // used MAX(app_catalog.updated_at_ms), which masked partial failures on page 2.
  const recent = await env.APP_DB.prepare(
    "SELECT value FROM activation_config WHERE key='catalog_last_complete_sync_ms'"
  ).first();
  const lastComplete = Number(recent?.value || 0);
  if (!options.force && lastComplete && Date.now()-lastComplete < 15*60_000)
    return {configured:true,refreshed:false,skipped:"already_fresh"};
  let imported=0,page=0,lastPageItems=0;
  try {
    for (page=1;page<=25;page++) {
      const response=await fetch(PROVIDER+"/api/listar-aplicativos?page="+page+"&limit=200",{
        headers:{"X-API-Key":env.ATIVEAPP_API_KEY,"Accept":"application/json"},
        signal:AbortSignal.timeout(12000),
        cf:{cacheTtl:0,cacheEverything:false},
      });
      if(!response.ok) throw new Error("upstream_http_"+response.status);
      const body=await response.json();
      const apps=parseApps(body);
      if(page===1 && apps.length===0)throw new Error("empty_upstream_catalog");
      if(page===1){
        const sample = Array.isArray(body?.items)?body.items[0]:
          Array.isArray(body?.data)?body.data[0]:
          Array.isArray(body?.aplicativos)?body.aplicativos[0]:
          Array.isArray(body?.results)?body.results[0]:
          Array.isArray(body)?body[0]:null;
        const keys=sample&&typeof sample==="object"&&!Array.isArray(sample)?
          Object.keys(sample).filter(k=>/^[a-zA-Z0-9_]{1,80}$/.test(k)).slice(0,65):[];
        await catalogSyncMeta(env.APP_DB,{supplier_catalog_fields:JSON.stringify(keys)});
      }
      lastPageItems=apps.length;
      if(apps.length===0)break;
      const now=Date.now();
      // upsert metadata only; never replace a reseller's sale_price_cents.
      await env.APP_DB.batch(apps.map(a=>env.APP_DB.prepare(
        "INSERT INTO app_catalog (app_id,name,module,provider_cost_cents,provider_store_price_cents,logo_url,updated_at_ms) VALUES (?,?,?,?,?,?,?) " +
        "ON CONFLICT(app_id) DO UPDATE SET name=excluded.name,module=excluded.module," +
        "provider_cost_cents=excluded.provider_cost_cents,provider_store_price_cents=excluded.provider_store_price_cents," +
        "logo_url=COALESCE(excluded.logo_url,app_catalog.logo_url),updated_at_ms=excluded.updated_at_ms"
      ).bind(a.id,a.name,a.module,a.cost,a.storePrice,a.logoUrl,now)));
      imported+=apps.length;
      // The provider may report has_more=false even on a full page.
      // Stop on actual page length instead; this includes newly added apps.
      if(apps.length<200)break;
    }
    if(page>25 && lastPageItems===200)throw new Error("page_cap_reached");
    await catalogSyncMeta(env.APP_DB,{
      catalog_last_complete_sync_ms:Date.now(),
      catalog_last_complete_import_count:imported,
      catalog_last_complete_pages:page,
      catalog_last_sync_error:"none",
    });
    return {configured:true,refreshed:true,imported,pages:page};
  }catch(e){
    await catalogSyncMeta(env.APP_DB,{
      catalog_last_sync_error:String(e?.message||"unknown").slice(0,100),
      catalog_last_failed_page:page,
    }).catch(()=>{});
    return {configured:true,refreshed:false,supplierUnavailable:true,imported,failedPage:page};
  }
}
async function processPaidActivation(request,env,origin) {
  if(!env.APP_DB||!env.PAYMENTS_DB||!env.ATIVEAPP_API_KEY)return respond({error:"unavailable"},503,origin);
  const input=await request.json().catch(()=>null);
  const orderId=typeof input?.orderId==="string"&&/^[a-f0-9-]{36}$/i.test(input.orderId)?input.orderId:null;
  const nonce=typeof input?.nonce==="string"&&/^[a-f0-9-]{36}$/i.test(input.nonce)?input.nonce:null;
  if(!orderId||!nonce)return respond({error:"invalid_order"},400,origin);
  // Payment metadata must have been marked verified by the independent,
  // authenticated Asaas payment worker. Do not trust the POST body.
  const order=await env.PAYMENTS_DB.prepare(
    "SELECT order_id,owner_user_id,app_id,mac_normalized,amount_cents,paid_at_ms,"+
    "status,supplier_state,last_payment_check_at_ms,fulfill_nonce FROM pix_orders WHERE order_id=?"
  ).bind(orderId).first();
  if(!order||order.fulfill_nonce!==nonce||order.status!=="paid_pending_activation"||
    order.supplier_state!=="submitting"||
    !Number.isInteger(order.paid_at_ms)||Date.now()-Number(order.last_payment_check_at_ms)>300000)
    return respond({error:"payment_not_verified"},403,origin);
  const app=await env.APP_DB.prepare(
    "SELECT name FROM app_catalog WHERE app_id=?"
  ).bind(order.app_id).first();
  const mac=cleanMac(order.mac_normalized);
  if(!app||!mac||mac==="00:00:00:00:00:00"||mac==="FF:FF:FF:FF:FF:FF")
    return respond({error:"invalid_activation_details"},400,origin);
  const requestId=order.order_id;
  const now=Date.now();
  const insert=await env.APP_DB.prepare(
    "INSERT OR IGNORE INTO activation_requests "+
    "(request_id,owner_user_id,app_id,app_name,mac,sale_price_cents,idempotency_key,"+
    "status,channel,confirmed_at_ms,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(requestId,order.owner_user_id,order.app_id,app.name,mac,
    order.amount_cents,requestId,"submitting","web",now,now,now).run();
  if(!insert.meta?.changes){
    // A supplier call may have reached them before our network timed out.
    // Never send a second activation for the same paid order.
    const recorded=await env.APP_DB.prepare(
      "SELECT status,provider_id FROM activation_requests WHERE request_id=?"
    ).bind(requestId).first();
    return respond({error:"already_submitted_or_in_review",status:recorded?.status,
      providerId:recorded?.provider_id},409,origin);
  }
  try{
    const upstream=await fetch(PROVIDER+"/api/solicitar-ativacao",{
      method:"POST",
      headers:{"X-API-Key":env.ATIVEAPP_API_KEY,"content-type":"application/json"},
      body:JSON.stringify({app_uuid:order.app_id,mac_app:mac}),
      signal:AbortSignal.timeout(15000),cf:{cacheTtl:0,cacheEverything:false},
    });
    const body=await upstream.json().catch(()=>null);
    const providerId=body?.id||body?.success_case?.body?.id||body?.data?.id;
    if(!upstream.ok||!providerId){
      const code=upstream.status===429?"supplier_429":
        upstream.status===400?"supplier_validation_or_balance":"supplier_error";
      await env.APP_DB.prepare(
        "UPDATE activation_requests SET status='needs_review',provider_http_status=?,provider_error_code=?,updated_at_ms=? WHERE request_id=?"
      ).bind(upstream.status,code,Date.now(),requestId).run();
      return respond({error:code,accepted:false},502,origin);
    }
    await env.APP_DB.prepare(
      "UPDATE activation_requests SET status='submitted',provider_id=?,provider_http_status=?,updated_at_ms=? WHERE request_id=?"
    ).bind(String(providerId).slice(0,120),upstream.status,Date.now(),requestId).run();
    return respond({accepted:true,requestId},202,origin);
  }catch{
    // Unknown network outcome: hold for manual reconciliation; no repeat.
    await env.APP_DB.prepare(
      "UPDATE activation_requests SET status='needs_review',provider_error_code='unknown_supplier_outcome',updated_at_ms=? WHERE request_id=?"
    ).bind(Date.now(),requestId).run();
    return respond({error:"unknown_supplier_outcome"},503,origin);
  }
}
/**
 * Pulls definitive activation outcomes from the provider's authenticated
 * history endpoint. Webhook data alone cannot authorize an activation or
 * overwrite a user's order. Never infer completion from payment status.
 */
async function reconcileActivationResults(env) {
  if (!env.APP_DB || !env.PAYMENTS_DB || !env.ATIVEAPP_API_KEY) return;
  const pending = await env.APP_DB.prepare(
    "SELECT request_id, provider_id, owner_user_id FROM activation_requests " +
    "WHERE status='submitted' AND provider_id IS NOT NULL ORDER BY updated_at_ms ASC LIMIT 60"
  ).all();
  const requests = pending.results || [];
  if (!requests.length) return;
  const byProvider = new Map(requests.map(x => [String(x.provider_id), x]));
  let checked = 0;
  try {
    for (let page=1;page<=5 && byProvider.size;page++) {
      const res = await fetch(PROVIDER + "/api/historico?page="+page+"&limit=100",{
        headers:{"X-API-Key":env.ATIVEAPP_API_KEY,"Accept":"application/json"},
        signal:AbortSignal.timeout(12000),cf:{cacheTtl:0,cacheEverything:false}
      });
      if (!res.ok) throw new Error("history_http_"+res.status);
      const body=await res.json();
      const rows=Array.isArray(body?.items)?body.items:
        Array.isArray(body?.data?.items)?body.data.items:
        Array.isArray(body?.data)?body.data:
        Array.isArray(body?.historico)?body.historico:
        Array.isArray(body?.results)?body.results:Array.isArray(body)?body:[];
      for (const item of rows) {
        const key=String(item?.id??item?.historico_id??"");
        const target=byProvider.get(key);
        if(!target) continue;
        const state=String(item?.status_transacao??item?.status??"").toLowerCase();
        const status=state==="ativado"||state==="activated"?"activated":
          state==="incorreto"||state==="incorrect"?"incorrect":null;
        if(!status) continue;
        const now=Date.now();
        const expiration=typeof item?.data_expiracao==="string" &&
          item.data_expiracao.length<=60 ? item.data_expiracao:null;
        const update=await env.APP_DB.prepare(
          "UPDATE activation_requests SET status=?,expires_at=?,updated_at_ms=? " +
          "WHERE request_id=? AND provider_id=? AND status='submitted'"
        ).bind(status,expiration,now,target.request_id,key).run();
        if(update.meta?.changes){
          checked++;
          if(status==="activated"){
            await env.PAYMENTS_DB.prepare(
              "UPDATE pix_orders SET status='activated',updated_at_ms=? " +
              "WHERE order_id=? AND owner_user_id=? AND supplier_state='accepted' AND status='paid_pending_activation'"
            ).bind(now,target.request_id,target.owner_user_id).run();
          }else{
            await env.PAYMENTS_DB.prepare(
              "UPDATE pix_orders SET status='needs_review',supplier_state='needs_review'," +
              "last_error_code='provider_incorrect',updated_at_ms=? WHERE order_id=? AND owner_user_id=? AND supplier_state='accepted'"
            ).bind(now,target.request_id,target.owner_user_id).run();
          }
        }
        byProvider.delete(key);
      }
      if(rows.length<100)break;
    }
    await catalogSyncMeta(env.APP_DB,{
      activation_status_last_checked_ms:Date.now(),
      activation_status_updates:checked,
      activation_status_sync_error:"none",
    });
  }catch(e){
    await catalogSyncMeta(env.APP_DB,{
      activation_status_sync_error:String(e?.message||"unknown").slice(0,80),
    }).catch(()=>{});
  }
}
async function verifyAdminRole(request, userId) {
  const bearer = request.headers.get("authorization") || "";
  const key = request.headers.get("x-sm-public-key") || "";
  if (!userId || !bearer.startsWith("Bearer ") || !key) return false;
  try {
    const response = await fetch(AUTH_BASE + "/rest/v1/rpc/has_role", {
      method: "POST",
      headers: { "authorization": bearer, "apikey": key, "content-type": "application/json" },
      body: JSON.stringify({ _user_id: userId, _role: "admin" }),
      signal: AbortSignal.timeout(6500),
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    return response.ok && (await response.json()) === true;
  } catch { return false; }
}
async function getConfig(db) {
  const result = await db.prepare(
    "SELECT key,value FROM activation_config WHERE key IN ('live_activations_enabled','sale_prices_approved')"
  ).all();
  return Object.fromEntries((result.results || []).map(r => [r.key, r.value === "true"]));
}
export default {
  async scheduled(event, env, ctx) {
    if (!env.APP_DB || !env.ATIVEAPP_API_KEY) return;
    if(event?.cron === "*/2 * * * *"){
      ctx.waitUntil(reconcileActivationResults(env).catch(()=>{}));
    }else{
      ctx.waitUntil(refreshCatalog(env).catch(()=>{}));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") {
      if (!ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin && !ORIGINS.has(origin)) return respond({ error: "forbidden_origin" }, 403, origin);
    if (url.pathname === "/health" && request.method === "GET") {
      return respond({ service: "Stream Monitor - Ativação de aplicativos", runtime: "Cloudflare",
        safe_mode: true }, 200, origin);
    }
    // Public, read-only and sanitized storefront catalog for the linked Telegram bot.
    // No user IDs, provider purchase costs, MACs, API secrets or write operations.
    // Inventory is refreshed only by an authenticated site request or the Cron.
    if (request.method === "GET" && url.pathname === "/v1/telegram/catalog") {
      if (!env.APP_DB) return respond({ error: "database_unavailable" }, 503, origin);
      const page = Math.max(1, Math.min(40, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
      const q = String(url.searchParams.get("q") || "").trim().slice(0, 65).toLowerCase().replace(/[%_]/g, "");
      const limit = 8;
      const rows = await env.APP_DB.prepare(
        "SELECT app_id AS id,name,module,provider_store_price_cents AS priceCents " +
        "FROM app_catalog WHERE is_active=1 AND provider_store_price_cents>=100 AND lower(name) LIKE ? ORDER BY name,app_id LIMIT ? OFFSET ?"
      ).bind("%" + q + "%", limit + 1, (page - 1) * limit).all();
      const matches = rows.results || [];
      return respond({ items: matches.slice(0,limit), page, hasMore: matches.length > limit,
        configured: !!env.ATIVEAPP_API_KEY, live: false }, 200, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/telegram/app") {
      if (!env.APP_DB) return respond({ error: "database_unavailable" }, 503, origin);
      const id = url.searchParams.get("id") || "";
      if (!appIdOk(id)) return respond({ error: "invalid_app" }, 400, origin);
      const app = await env.APP_DB.prepare(
        "SELECT app_id AS id,name,module,provider_store_price_cents AS priceCents FROM app_catalog " +
        "WHERE app_id=? AND is_active=1 AND provider_store_price_cents>=100"
      ).bind(id).first();
      return app ? respond({ app, live: false }, 200, origin)
        : respond({ error: "not_found" }, 404, origin);
    }
    if(url.pathname==="/internal/paid-activation"&&request.method==="POST")
      return processPaidActivation(request,env,origin);
    if (!url.pathname.startsWith("/v1/")) return respond({ error: "not_found" }, 404, origin);
    let userId;
    try { userId = await userFromRequest(request); }
    catch { return respond({ error: "auth_unavailable" }, 503, origin); }
    if (!userId) return respond({ error: genericError(401) }, 401, origin);
    if (!env.APP_DB) return respond({ error: "database_unavailable" }, 503, origin);
    try {
      if (url.pathname.startsWith("/v1/admin/")) {
        if (!(await verifyAdminRole(request,userId))) return respond({ error: "Apenas administradores podem alterar preços." },403,origin);
        if (request.method === "GET" && url.pathname === "/v1/admin/flow-check") {
          // Readiness dashboard: no payment, activation, supplier or secret write.
          const stats = await env.APP_DB.prepare(
            "SELECT COUNT(*) AS apps,COUNT(*) FILTER (WHERE is_active=1 AND provider_store_price_cents>=100) AS listed," +
            "COUNT(logo_url) AS logos FROM app_catalog"
          ).first();
          const activeFlags = await getConfig(env.APP_DB);
          const current = {
            catalog: (stats?.listed || 0) > 0 ? "ready" : "blocked",
            macReview: "preview",
            pix: "blocked",
            reconciliation: "blocked",
            supplierActivation: "blocked",
            telegram: "preview",
            notification: "blocked",
          };
          let financial = { databaseConnected: false, providerConnected: false,
            webhookRegistered: false, accountAuthorized: false,
            environmentMatched: false, orderCount: null, eventCount: null,
            lastProbeAt: null, paymentEnabled: false };
          if (env.PAYMENTS_DB) {
            const flags = await env.PAYMENTS_DB.prepare(
              "SELECT key,value FROM merchant_config WHERE key IN (" +
              "'provider_account_http_status','provider_webhook_list_http_status','provider_webhook_url_present'," +
              "'provider_webhook_enabled','provider_key_env_detected','provider_checked_at_ms','merchant_authorized'," +
              "'merchant_verified','environment','payment_creation_enabled')"
            ).all();
            const config = Object.fromEntries((flags.results || []).map(r => [r.key, r.value]));
            const counts = await env.PAYMENTS_DB.prepare(
              "SELECT (SELECT COUNT(*) FROM pix_orders) AS orders," +
              "(SELECT COUNT(*) FROM pix_webhook_events) AS events"
            ).first();
            financial = {
              databaseConnected: true,
              providerConnected: config.provider_account_http_status === "200" &&
                config.provider_webhook_list_http_status === "200",
              webhookRegistered: config.provider_webhook_url_present === "true" &&
                config.provider_webhook_enabled === "true",
              accountAuthorized: config.merchant_authorized === "true" &&
                config.merchant_verified === "true",
              environmentMatched: !!config.environment &&
                config.environment === config.provider_key_env_detected,
              orderCount: counts?.orders ?? 0,
              eventCount: counts?.events ?? 0,
              lastProbeAt: config.provider_checked_at_ms ? Number(config.provider_checked_at_ms) : null,
              paymentEnabled: config.payment_creation_enabled === "true",
            };
          }
          return respond({
            steps: current,
            catalog: {total: stats?.apps || 0, published: stats?.listed || 0, logos: stats?.logos || 0},
            financial, supplierLiveEnabled: activeFlags.live_activations_enabled === true,
            pricesApproved: activeFlags.sale_prices_approved === true,
            dryRunOnly: true,
          }, 200, origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/admin/refresh-catalog") {
          const result=await refreshCatalog(env,{force:true});
          return respond(result, result.supplierUnavailable ? 503 : 200,origin);
        }
        if (request.method === "GET" && url.pathname === "/v1/admin/catalog") {
          const rows = await env.APP_DB.prepare(
            "SELECT app_id AS id,name,module,provider_cost_cents AS providerValue,provider_store_price_cents AS storePriceCents, " +
            "sale_price_cents AS priceCents,COALESCE(custom_logo_url,logo_url) AS logoUrl,is_active AS active,updated_at_ms AS updatedAt " +
            "FROM app_catalog ORDER BY name LIMIT 500"
          ).all();
          const meta = await env.APP_DB.prepare(
            "SELECT value FROM activation_config WHERE key='supplier_catalog_fields'"
          ).first();
          const syncRows=await env.APP_DB.prepare(
            "SELECT key,value FROM activation_config WHERE key IN ("+
              "'catalog_last_complete_sync_ms','catalog_last_complete_import_count','catalog_last_complete_pages','catalog_last_sync_error')"
          ).all();
          const sync=Object.fromEntries((syncRows.results||[]).map(x=>[x.key,x.value]));
          let supplierFields = [];
          try { supplierFields = JSON.parse(meta?.value || "[]"); } catch {}
          return respond({
            items:rows.results || [], supplierFields, sync,
            logoCount:(rows.results||[]).filter(x => !!x.logoUrl).length,
            note: "O valor do fornecedor é bruto da API, com unidade não confirmada; não é automaticamente preço em reais.",
          },200,origin);
        }
        if (request.method === "POST" && url.pathname === "/v1/admin/price") {
          const data = await request.json().catch(() => null);
          if (!appIdOk(data?.appId)) return respond({error:"Aplicativo inválido."},400,origin);
          const price = data?.priceCents;
          if (price !== null && (!Number.isSafeInteger(price) || price < 100 || price > 999999))
            return respond({error:"Informe um preço entre R$ 1,00 e R$ 9.999,99 ou deixe sem preço."},400,origin);
          const logoChanged = data && Object.prototype.hasOwnProperty.call(data,"logoUrl");
          const logo = logoChanged && data.logoUrl !== null && data.logoUrl !== ""
            ? validLogoUrl(data.logoUrl) : null;
          if (logoChanged && data.logoUrl && !logo)
            return respond({error:"A imagem precisa ter um endereço HTTPS válido."},400,origin);
          const sql = logoChanged
            ? "UPDATE app_catalog SET sale_price_cents=?,custom_logo_url=? WHERE app_id=?"
            : "UPDATE app_catalog SET sale_price_cents=? WHERE app_id=?";
          const args = logoChanged ? [price,logo,data.appId] : [price,data.appId];
          const update = await env.APP_DB.prepare(sql).bind(...args).run();
          if (!update.meta?.changes) return respond({error:"Aplicativo não localizado."},404,origin);
          const saved = await env.APP_DB.prepare(
            "SELECT app_id AS id,sale_price_cents AS priceCents,COALESCE(custom_logo_url,logo_url) AS logoUrl FROM app_catalog WHERE app_id=?"
          ).bind(data.appId).first();
          return respond({ saved },200,origin);
        }
        return respond({error:"not_found"},404,origin);
      }
      const settings = await getConfig(env.APP_DB);
      let financialEnabled=false;
      if(env.PAYMENTS_DB){
        const financial=await env.PAYMENTS_DB.prepare(
          "SELECT key,value FROM merchant_config WHERE key IN ("+
          "'merchant_authorized','merchant_verified','payment_creation_enabled',"+
          "'activation_auto_delivery_enabled','environment','provider_key_env_detected',"+
          "'provider_account_http_status','provider_webhook_enabled','pix_canary_enabled',"+
          "'merchant_fingerprint')"
        ).all();
        const cfg=Object.fromEntries((financial.results||[]).map(x=>[x.key,x.value]));
        financialEnabled=cfg.merchant_authorized==="true"&&cfg.merchant_verified==="true"&&
          cfg.payment_creation_enabled==="true"&&cfg.activation_auto_delivery_enabled==="true"&&
          cfg.environment===cfg.provider_key_env_detected&&
          cfg.provider_account_http_status==="200"&&cfg.provider_webhook_enabled==="true";
      }
      const liveForEveryone=settings.live_activations_enabled === true &&
        settings.sale_prices_approved === true && !!env.ATIVEAPP_API_KEY && financialEnabled;
      let canaryReady=false;
      if(!liveForEveryone&&env.PAYMENTS_DB&&env.ATIVEAPP_API_KEY){
        const rows=await env.PAYMENTS_DB.prepare(
          "SELECT key,value FROM merchant_config WHERE key IN ("+
          "'pix_canary_enabled','environment','provider_key_env_detected',"+
          "'provider_account_http_status','provider_webhook_url_present',"+
          "'provider_webhook_enabled','merchant_fingerprint')"
        ).all();
        const m=Object.fromEntries((rows.results||[]).map(x=>[x.key,x.value]));
        canaryReady=m.pix_canary_enabled==="true"&&m.environment===m.provider_key_env_detected&&
          m.provider_account_http_status==="200"&&m.provider_webhook_url_present==="true"&&
          m.provider_webhook_enabled==="true"&&
          /^[a-f0-9]{24}$/.test(m.merchant_fingerprint||"")&&
          await verifyAdminRole(request,userId);
      }
      const enabled=liveForEveryone||canaryReady;
      if (request.method === "GET" && url.pathname === "/v1/catalog") {
        const sync = await refreshCatalog(env);
        const q = String(url.searchParams.get("q") || "").trim().slice(0,80).toLowerCase();
        const rows = await env.APP_DB.prepare(
          "SELECT app_id AS id,name,module,COALESCE(custom_logo_url,logo_url) AS logoUrl,provider_store_price_cents AS priceCents " +
          "FROM app_catalog WHERE is_active=1 AND provider_store_price_cents>=100 AND lower(name) LIKE ? ORDER BY name LIMIT 300"
        ).bind("%" + q.replace(/[%_]/g, "") + "%").all();
        return respond({ items: rows.results || [], configured: sync.configured === true,
          live: enabled, canary:canaryReady, requiresPayment: true, supplierUnavailable: !!sync.supplierUnavailable }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/v1/history") {
        const rows = await env.APP_DB.prepare(
          "SELECT request_id AS id, app_name AS appName,mac,status,created_at_ms AS createdAt," +
          "provider_id AS providerId,expires_at AS expiresAt FROM activation_requests " +
          "WHERE owner_user_id=? ORDER BY created_at_ms DESC LIMIT 50"
        ).bind(userId).all();
        return respond({ items: rows.results || [] }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/v1/activate") {
        // The only irreversible supplier write MUST be gated by verified
        // financial settlement. The payment ledger is not integrated yet:
        // never call provider, even if an operator accidentally enables config.
        if (!enabled) return respond({
          error: "As ativações ainda estão em preparação. Nenhuma cobrança foi realizada."
        }, 503, origin);
        return respond({
          error: "Pagamento e confirmação financeira ainda não integrados. Nenhuma ativação foi enviada."
        }, 503, origin);
      }
      return respond({ error: "not_found" }, 404, origin);
    } catch {
      return respond({ error: "Não foi possível processar esta solicitação." }, 503, origin);
    }
  },
};