import { createFileRoute } from "@tanstack/react-router";

/** Dedicated priority queue: it never runs the heavy IPTV/payment cron.
 * The secret is supplied by the existing private pg_cron/vault integration.
 */
export const Route = createFileRoute("/api/public/cron/dns-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (process.env.IS_CORE === "true") {
          return Response.json({ ok: true, skipped: true, reason: "worker mode" });
        }
        try {
          const { withCycleLock } = await import("@/lib/job-lock.server");
          const { runDueDnsRecoveryChecks } = await import("@/lib/dns.server");
          const result = await withCycleLock("cron-dns-recovery", 55, () => runDueDnsRecoveryChecks(16));
          return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          console.error("[dns-recovery] priority cycle failed", error instanceof Error ? error.name : "unknown");
          return Response.json({ ok: false, error: "recovery_cycle_failed" }, { status: 503 });
        }
      },
    },
  },
});
