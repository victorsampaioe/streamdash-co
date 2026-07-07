import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  server_id: z.string().uuid(),
  region_code: z.string().min(1).max(64),
  status: z.enum(["up", "down", "degraded", "unknown", "pending"]),
  http_status: z.number().int().nullable().optional(),
  latency_ms: z.number().int().nullable().optional(),
  error: z.string().max(500).nullable().optional(),
});

function verify(rawBody: string, signature: string | null): boolean {
  const secret = process.env.REGION_WORKER_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/regions/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-signature");
        if (!verify(raw, sig)) return new Response("Forbidden", { status: 403 });

        let parsed;
        try { parsed = payloadSchema.parse(JSON.parse(raw)); }
        catch (e: any) { return new Response(`Invalid payload: ${e?.message ?? "error"}`, { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Validate that region exists
        const { data: region } = await supabaseAdmin
          .from("check_regions").select("code").eq("code", parsed.region_code).maybeSingle();
        if (!region) return new Response("Unknown region_code", { status: 400 });

        const { error } = await supabaseAdmin.from("region_checks").insert({
          server_id: parsed.server_id,
          region_code: parsed.region_code,
          status: parsed.status,
          http_status: parsed.http_status ?? null,
          latency_ms: parsed.latency_ms ?? null,
          error: parsed.error ?? null,
        });
        if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
