import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/regions/targets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyRegionSignature, secretFingerprint, getRegionSecret } = await import(
          "@/lib/region-auth.server"
        );
        const url = new URL(request.url);

        // Diagnostic mode: never returns the secret, only a hash prefix so the
        // worker owner can confirm both sides share the same value.
        if (url.searchParams.get("diag") === "1") {
          return Response.json({
            route: "ok",
            secret_configured: Boolean(getRegionSecret()),
            secret_fingerprint: secretFingerprint(),
            signature_valid: verifyRegionSignature("targets", request.headers.get("x-signature")),
            hint: "x-signature must be hex HMAC-SHA256 of the literal string 'targets'",
          }, { headers: { "cache-control": "no-store" } });
        }

        const sig = request.headers.get("x-signature");
        const agentId = request.headers.get("x-agent-id");
        const { authenticateAgent } = await import("@/lib/region-agent.server");
        const agent = agentId ? await authenticateAgent(agentId, "targets", sig) : null;
        if (!agent && !verifyRegionSignature("targets", sig)) {
          return new Response("Forbidden", { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Only monitor servers owned by users with active subscription/trial.
        const nowIso = new Date().toISOString();
        const { data: subs } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id, status, expires_at");
        const activeOwners = new Set<string>();
        for (const s of subs ?? []) {
          if ((s.status === "active" || s.status === "trial") && s.expires_at > nowIso) {
            activeOwners.add(s.user_id);
          }
        }

        const { data: servers } = await supabaseAdmin
          .from("servers")
          .select("id, host, owner_id, iptv_username, iptv_password, iptv_detected");
        const targets = (servers ?? [])
          .filter((s) => activeOwners.has(s.owner_id))
          .map((s) => (agent
            ? {
                server_id: s.id,
                host: s.host,
                iptv: s.iptv_username && s.iptv_password
                  ? { username: s.iptv_username, password: s.iptv_password, kind: s.iptv_detected }
                  : null,
              }
            : { server_id: s.id, host: s.host }));

        return Response.json({ region: agent?.region_code ?? null, targets, count: targets.length }, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
