/**
 * Public reseller status edge cache.
 * Read-only; caches strictly public opted-in status pages for 30 seconds.
 * Works without KV/D1/Queues, keeping free-tier costs low.
 */
const SLUG = /^\/status\/([a-z0-9][a-z0-9-]{2,39})\/?$/;
const TTL = 30;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", {status:405,headers:{Allow:"GET, HEAD"}});
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({status:"ok",service:"streammonitor-public-status-cache",
        cache_ttl_seconds:TTL}, {headers:{"Cache-Control":"no-store"}});
    }
    const match = url.pathname.match(SLUG);
    if (!match) return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
    if (!env.STATUS_ORIGIN) return new Response("Origin missing",{status:503});
    const origin=new URL(env.STATUS_ORIGIN);
    if (origin.protocol!=="https:") return new Response("HTTPS required",{status:503});
    // Deliberately discard query strings and request cookies.
    const remote=new URL("/api/public/status/"+match[1], origin);
    const cacheKey=new Request(url.origin+url.pathname,{method:"GET"});
    const cache=caches.default;
    try {
      const stored=await cache.match(cacheKey);
      if (stored) {
        const headers=new Headers(stored.headers);
        headers.set("X-Edge-Cache","HIT");
        return new Response(request.method==="HEAD"?null:stored.body,{status:stored.status,headers});
      }
      const res=await fetch(remote.toString(),{
        method:"GET",redirect:"error",
        headers:{Accept:"application/json"},
        signal:AbortSignal.timeout(10_000),
        cf:{cacheTtl:0,cacheEverything:false},
      });
      if (res.status===503 || res.status===429)
        return Response.json({error:"temporarily_unavailable"}, {status:503,headers:{"Cache-Control":"no-store"}});
      if (res.status!==200 && res.status!==404) return new Response("Upstream error",{status:502,headers:{"Cache-Control":"no-store"}});
      const headers=new Headers({
        "Content-Type":"application/json;charset=utf-8",
        "Cache-Control":`public,max-age=${TTL},s-maxage=${TTL}`,
        "X-Content-Type-Options":"nosniff",
        "Access-Control-Allow-Origin":"*",
        "X-Edge-Cache":"MISS",
      });
      const body=await res.text();
      if(body.length>100_000)return new Response("Response too large",{status:502});
      const response=new Response(request.method==="HEAD"?null:body,{status:res.status,headers});
      ctx.waitUntil(cache.put(cacheKey,new Response(body,{status:res.status,headers})).catch(()=>{}));
      return response;
    } catch(e) {
      console.error("status cache error",e instanceof Error?e.name:"unknown");
      return Response.json({error:"temporarily_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
    }
  },
};
