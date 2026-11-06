import { createFileRoute } from "@tanstack/react-router";

/** Heartbeat even when there are no active targets to probe. */
export const Route = createFileRoute("/api/public/regions/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const agentId = request.headers.get("x-agent-id");
        const signature = request.headers.get("x-signature");
        const { authenticateAgent, touchAgent } = await import("@/lib/region-agent.server");
        const agent = await authenticateAgent(agentId, "heartbeat", signature);
        const { verifyCloudflareEdgeSignature } = await import("@/lib/region-cloudflare-auth.server");
        const cfEdge = await verifyCloudflareEdgeSignature("heartbeat", request.headers.get("x-cf-signature"));
        if (!cfEdge && (!agent || agent.region_code !== "cf-edge"))
          return Response.json({ error: "Forbidden" }, { status: 403 });
        if (agent) await touchAgent(agent.id, 0);
        else {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("region_agents")
            .select("id").eq("region_code", "cf-edge").eq("enabled", true).maybeSingle();
          if (data) await touchAgent(data.id, 0);
        }
        return Response.json({ ok: true, region: "cf-edge" }, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
