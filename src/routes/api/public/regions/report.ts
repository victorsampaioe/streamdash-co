import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const itemSchema = z.object({
  server_id: z.string().uuid(),
  region_code: z.string().min(1).max(64),
  status: z.enum(["up", "down", "degraded", "unknown", "pending"]),
  http_status: z.number().int().nullable().optional(),
  latency_ms: z.number().int().nullable().optional(),
  error: z.string().max(500).nullable().optional(),
});

// Aceita 1 report (formato antigo) ou um lote { reports: [...] } (novo worker).
const payloadSchema = z.union([
  itemSchema.transform((r) => [r]),
  z.object({ reports: z.array(itemSchema).min(1).max(200) }).transform((b) => b.reports),
]);


export const Route = createFileRoute("/api/public/regions/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-signature");
        const { verifyRegionSignature } = await import("@/lib/region-auth.server");
        if (!verifyRegionSignature(raw, sig)) return new Response("Forbidden", { status: 403 });


        let parsed;
        try { parsed = payloadSchema.parse(JSON.parse(raw)); }
        catch (e: any) { return new Response(`Invalid payload: ${e?.message ?? "error"}`, { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: region } = await supabaseAdmin
          .from("check_regions").select("code, name, city, flag").eq("code", parsed.region_code).maybeSingle();
        if (!region) return new Response("Unknown region_code", { status: 400 });

        // Fetch previous status for this (server, region) to detect transitions.
        const { data: prev } = await supabaseAdmin
          .from("region_checks")
          .select("status")
          .eq("server_id", parsed.server_id)
          .eq("region_code", parsed.region_code)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error } = await supabaseAdmin.from("region_checks").insert({
          server_id: parsed.server_id,
          region_code: parsed.region_code,
          status: parsed.status,
          http_status: parsed.http_status ?? null,
          latency_ms: parsed.latency_ms ?? null,
          error: parsed.error ?? null,
        });
        if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

        // Fire alerts on state transitions (down / recovery).
        const prevStatus = prev?.status ?? null;
        const goingDown = parsed.status === "down" && prevStatus !== "down";
        const recovering = parsed.status === "up" && prevStatus === "down";
        if (goingDown || recovering) {
          try {
            const { sendRegionAlert } = await import("@/lib/monitoring.server");
            await sendRegionAlert({
              serverId: parsed.server_id,
              region: { code: region.code, name: region.name, city: region.city, flag: region.flag },
              event: goingDown ? "down" : "up",
              latencyMs: parsed.latency_ms ?? null,
              error: parsed.error ?? null,
            });
          } catch { /* non-fatal */ }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
