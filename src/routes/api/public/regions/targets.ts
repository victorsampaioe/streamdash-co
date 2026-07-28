import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

// Discovery endpoint: regional worker asks "what should I check right now?".
// Auth: HMAC of the literal string "targets" using REGION_WORKER_SECRET.
// This avoids exposing host names publicly.
function verify(sig: string | null): boolean {
  const secret = process.env.REGION_WORKER_SECRET;
  if (!secret || !sig) return false;
  const expected = createHmac("sha256", secret).update("targets").digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/regions/targets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!verify(request.headers.get("x-signature"))) return new Response("Forbidden", { status: 403 });
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
          .select("id, host, owner_id");
        const targets = (servers ?? [])
          .filter((s) => activeOwners.has(s.owner_id))
          .map((s) => ({ server_id: s.id, host: s.host }));

        return Response.json({ targets, count: targets.length }, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
