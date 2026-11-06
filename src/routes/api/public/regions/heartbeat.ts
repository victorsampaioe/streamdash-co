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
        if (!agent || agent.region_code !== "cf-edge")
          return Response.json({ error: "Forbidden" }, { status: 403 });
        await touchAgent(agent.id, 0);
        return Response.json({ ok: true, region: agent.region_code }, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
