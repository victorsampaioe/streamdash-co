import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

export const analyzeServer = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv, error } = await context.supabase
      .from("servers")
      .select("id, host")
      .eq("id", data.serverId)
      .maybeSingle();
    if (error || !srv) throw new Error("Servidor não encontrado");

    const { analyzeHost } = await import("./analysis.server");
    const result = await analyzeHost(srv.host);

    const { error: upErr } = await context.supabase
      .from("server_analysis")
      .upsert({
        server_id: srv.id,
        is_cloudflare: result.is_cloudflare,
        cdn_provider: result.cdn_provider,
        ipv4: result.ipv4,
        ipv6: result.ipv6,
        nameservers: result.nameservers,
        ttl_seconds: result.ttl_seconds,
        ssl_issuer: result.ssl_issuer,
        ssl_expires_at: result.ssl_expires_at,
        ssl_algorithm: result.ssl_algorithm,
        country: result.country,
        city: result.city,
        asn: result.asn,
        org: result.org,
        response_ms: result.response_ms,
        cert_history: result.cert_history,
        raw: result.raw,
        analyzed_at: new Date().toISOString(),
      });
    if (upErr) throw new Error(upErr.message);

    return { ok: true, analysis: result };
  });
