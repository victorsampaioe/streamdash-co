import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const itemSchema = z.object({
  server_id: z.string().uuid(),
  region_code: z.string().min(1).max(64),
  status: z.enum(["up", "down", "degraded", "unknown", "pending"]),
  http_status: z.number().int().nullable().optional(),
  latency_ms: z.number().int().nullable().optional(),
  error: z.string().max(500).nullable().optional(),
  details: z.record(z.any()).optional(),
  source: z.string().max(32).optional(),
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
        const agentId = request.headers.get("x-agent-id");
        const { verifyRegionSignature } = await import("@/lib/region-auth.server");
        const { authenticateAgent, touchAgent } = await import("@/lib/region-agent.server");
        const agent = agentId ? await authenticateAgent(agentId, raw, sig) : null;
        if (!agent && !verifyRegionSignature(raw, sig)) {
          return new Response("Forbidden", { status: 403 });
        }


        let items: z.infer<typeof itemSchema>[];
        try { items = payloadSchema.parse(JSON.parse(raw)); }
        catch (e: any) { return new Response(`Invalid payload: ${e?.message ?? "error"}`, { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const codes = [...new Set(items.map((i) => i.region_code))];
        const { data: regions } = await supabaseAdmin
          .from("check_regions").select("code, name, city, flag").in("code", codes);
        const regionMap = new Map((regions ?? []).map((r) => [r.code, r]));
        if (codes.some((c) => !regionMap.has(c))) {
          return new Response("Unknown region_code", { status: 400 });
        }
        if (agent && codes.some((c) => c !== agent.region_code)) {
          return new Response("Region not allowed for this agent", { status: 403 });
        }

        // Previous status per (server, region) to detect transitions.
        const serverIds = [...new Set(items.map((i) => i.server_id))];
        const { data: prevRows } = await supabaseAdmin
          .from("region_checks")
          .select("server_id, region_code, status, checked_at")
          .in("server_id", serverIds)
          .in("region_code", codes)
          .order("checked_at", { ascending: false })
          .limit(2000);
        const prevMap = new Map<string, string>();
        for (const r of prevRows ?? []) {
          const k = `${r.server_id}|${r.region_code}`;
          if (!prevMap.has(k)) prevMap.set(k, r.status);
        }

        const { error } = await (supabaseAdmin as any).from("region_checks").insert(
          items.map((i) => ({
            server_id: i.server_id,
            region_code: i.region_code,
            status: i.status,
            http_status: i.http_status ?? null,
            latency_ms: i.latency_ms ?? null,
            error: i.error ?? null,
            details: i.details ?? {},
            source: agent ? "vps" : (i.source ?? "worker"),
          })),
        );
        if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

        // Fire alerts on state transitions (down / recovery).
        for (const i of items) {
          const prevStatus = prevMap.get(`${i.server_id}|${i.region_code}`) ?? null;
          const goingDown = i.status === "down" && prevStatus !== "down";
          const recovering = i.status === "up" && prevStatus === "down";
          if (!goingDown && !recovering) continue;
          // Consenso: só alerta queda quando a maioria dos pontos falha.
          if (goingDown) {
            const { data: consensus } = await (supabaseAdmin as any)
              .rpc("region_consensus", { _server_id: i.server_id, _window_minutes: 15 });
            if (consensus?.verdict !== "down") continue;
          }
          try {
            const region = regionMap.get(i.region_code)!;
            const { sendRegionAlert } = await import("@/lib/monitoring.server");
            await sendRegionAlert({
              serverId: i.server_id,
              region: { code: region.code, name: region.name, city: region.city, flag: region.flag },
              event: goingDown ? "down" : "up",
              latencyMs: i.latency_ms ?? null,
              error: i.error ?? null,
            });
          } catch { /* non-fatal */ }
        }

        if (agent) { try { await touchAgent(agent.id, items.length); } catch { /* noop */ } }

        return Response.json({ ok: true, inserted: items.length });
      },
    },
  },
});
