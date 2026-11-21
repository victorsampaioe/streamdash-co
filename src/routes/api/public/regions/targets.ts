import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/regions/targets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyRegionSignature } = await import("@/lib/region-auth.server");
        const sig = request.headers.get("x-signature");
        const agentId = request.headers.get("x-agent-id");
        const { authenticateAgent } = await import("@/lib/region-agent.server");
        const agent = agentId ? await authenticateAgent(agentId, "targets", sig) : null;
        const { verifyCloudflareEdgeSignature } = await import("@/lib/region-cloudflare-auth.server");
        const cfEdge = await verifyCloudflareEdgeSignature("targets", request.headers.get("x-cf-signature"));
        if (!agent && !cfEdge && !verifyRegionSignature("targets", sig)) {
          return new Response("Forbidden", { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: servers } = await supabaseAdmin
          .from("servers")
          .select("id, host, owner_id, iptv_username, iptv_password, iptv_detected, last_checked_at, monitoring_paused, dns_enabled, dns_status, current_status, dns_state_changed_at, dns_last_success_at, dns_last_failure_at, last_dns_check_at, host_changed_at")
          .eq("monitoring_paused", false)
          .is("auto_excluded_at", null)
          .order("id", { ascending: true });

        // Só entrega alvos de contas ativas (assinatura válida ou créditos).
        const { getActiveOwnerIds } = await import("@/lib/service-status.server");
        const activeOwners = await getActiveOwnerIds((servers ?? []).map((s) => s.owner_id));
        const targets = (servers ?? [])
          .filter((s) => activeOwners.has(s.owner_id))
          .map((s) => (agent && agent.region_code !== "cf-edge"
            ? {
                server_id: s.id,
                host: s.host,
                iptv: s.iptv_username && s.iptv_password
                  ? { username: s.iptv_username, password: s.iptv_password, kind: s.iptv_detected }
                  : null,
              }
            : { server_id: s.id, host: s.host, last_checked_at: s.last_checked_at ?? null }));

        return Response.json({ region: cfEdge ? "cf-edge" : (agent?.region_code ?? null), targets, count: targets.length }, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
