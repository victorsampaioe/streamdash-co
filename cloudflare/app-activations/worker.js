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
async function refreshCatalog(env) {
  if (!env.ATIVEAPP_API_KEY) return { configured: false, refreshed: false };
  const last = await env.APP_DB.prepare("SELECT MAX(updated_at_ms) AS updated FROM app_catalog").first();
  if (last?.updated && Date.now() - last.updated < 30 * 60_000) return { configured: true, refreshed: false };
  let imported = 0;
  try {
    for (let page = 1; page <= 6; page++) {
      const response = await fetch(PROVIDER + "/api/listar-aplicativos?page=" + page + "&limit=200", {
        headers: { "X-API-Key": env.ATIVEAPP_API_KEY, "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      if (!response.ok) throw new Error("provider_unavailable_" + response.status);
      const body = await response.json();
      const apps = parseApps(body);
      if (!apps.length) break;
      const now = Date.now();
      if (page === 1) {
        const sample = Array.isArray(body?.items) ? body.items[0] :
          Array.isArray(body?.data) ? body.data[0] :
          Array.isArray(body?.aplicativos) ? body.aplicativos[0] :
          Array.isArray(body?.results) ? body.results[0] : null;
        const keys = sample && typeof sample === "object" && !Array.isArray(sample)
          ? Object.keys(sample).filter(k => /^[a-zA-Z0-9_]{1,80}$/.test(k)).slice(0,65) : [];
        await env.APP_DB.prepare(
          "INSERT INTO activation_config(key,value,updated_at_ms) VALUES ('supplier_catalog_fields',?,?) " +
          "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at_ms=excluded.updated_at_ms"
        ).bind(JSON.stringify(keys),now).run();
      }
      await env.APP_DB.batch(apps.map(a => env.APP_DB.prepare(
        "INSERT INTO app_catalog (app_id,name,module,provider_cost_cents,provider_store_price_cents,logo_url,updated_at_ms) VALUES (?,?,?,?,?,?,?) " +
        "ON CONFLICT(app_id) DO UPDATE SET name=excluded.name,module=excluded.module," +
        "provider_cost_cents=excluded.provider_cost_cents,provider_store_price_cents=excluded.provider_store_price_cents," +
        "logo_url=COALESCE(excluded.logo_url,app_catalog.logo_url),updated_at_ms=excluded.updated_at_ms"
      ).bind(a.id, a.name, a.module, a.cost, a.storePrice, a.logoUrl, now)));
      imported += apps.length;
      if (body?.has_more === false || apps.length < 200) break;
    }
    return { configured: true, refreshed: imported > 0 };
  } catch {
    // Cached inventory can still be browsed. Supplier activation stays locked.
    return { configured: true, refreshed: false, supplierUnavailable: true };
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
  async scheduled(_event, env, ctx) {
    if (!env.APP_DB || !env.ATIVEAPP_API_KEY) return;
    ctx.waitUntil(refreshCatalog(env).catch(() => {}));
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
        "SELECT app_id AS id,name,module,sale_price_cents AS priceCents " +
        "FROM app_catalog WHERE is_active=1 AND sale_price_cents>=100 AND lower(name) LIKE ? ORDER BY name,app_id LIMIT ? OFFSET ?"
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
        "SELECT app_id AS id,name,module,sale_price_cents AS priceCents FROM app_catalog " +
        "WHERE app_id=? AND is_active=1 AND sale_price_cents>=100"
      ).bind(id).first();
      return app ? respond({ app, live: false }, 200, origin)
        : respond({ error: "not_found" }, 404, origin);
    }
    if (!url.pathname.startsWith("/v1/")) return respond({ error: "not_found" }, 404, origin);
    let userId;
    try { userId = await userFromRequest(request); }
    catch { return respond({ error: "auth_unavailable" }, 503, origin); }
    if (!userId) return respond({ error: genericError(401) }, 401, origin);
    if (!env.APP_DB) return respond({ error: "database_unavailable" }, 503, origin);
    try {
      if (url.pathname.startsWith("/v1/admin/")) {
        if (!(await verifyAdminRole(request,userId))) return respond({ error: "Apenas administradores podem alterar preços." },403,origin);
        if (request.method === "GET" && url.pathname === "/v1/admin/catalog") {
          const rows = await env.APP_DB.prepare(
            "SELECT app_id AS id,name,module,provider_cost_cents AS providerValue,provider_store_price_cents AS storePriceCents, " +
            "sale_price_cents AS priceCents,COALESCE(custom_logo_url,logo_url) AS logoUrl,is_active AS active,updated_at_ms AS updatedAt " +
            "FROM app_catalog ORDER BY name LIMIT 500"
          ).all();
          const meta = await env.APP_DB.prepare(
            "SELECT value FROM activation_config WHERE key='supplier_catalog_fields'"
          ).first();
          let supplierFields = [];
          try { supplierFields = JSON.parse(meta?.value || "[]"); } catch {}
          return respond({
            items:rows.results || [], supplierFields,
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
      const enabled = settings.live_activations_enabled === true &&
        settings.sale_prices_approved === true && !!env.ATIVEAPP_API_KEY;
      if (request.method === "GET" && url.pathname === "/v1/catalog") {
        const sync = await refreshCatalog(env);
        const q = String(url.searchParams.get("q") || "").trim().slice(0,80).toLowerCase();
        const rows = await env.APP_DB.prepare(
          "SELECT app_id AS id,name,module,COALESCE(custom_logo_url,logo_url) AS logoUrl,sale_price_cents AS priceCents " +
          "FROM app_catalog WHERE is_active=1 AND sale_price_cents>=100 AND lower(name) LIKE ? ORDER BY name LIMIT 300"
        ).bind("%" + q.replace(/[%_]/g, "") + "%").all();
        return respond({ items: rows.results || [], configured: sync.configured === true,
          live: enabled, requiresPayment: true, supplierUnavailable: !!sync.supplierUnavailable }, 200, origin);
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