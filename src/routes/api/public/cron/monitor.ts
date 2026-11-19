import { createFileRoute } from "@tanstack/react-router";

/**
 * Dedicated HTTP/IPTV uptime checks: the main reconciliation job may spend
 * minutes on payments, IPTV sync, and sweep. This endpoint must remain
 * independently callable by pg_cron, with its own distributed lock.
 */
export const Route = createFileRoute("/api/public/cron/monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (process.env.IS_CORE === "true") {
          return Response.json({ ok: true, skipped: true, reason: "worker mode" });
        }
        try {
          const { withCycleLock } = await import("@/lib/job-lock.server");
          const { isCloudflareHttpPrimary } = await import("@/lib/cloudflare-http-mode.server");
          // Cloudflare regional-edge + DB reconcile now own uptime. Never
          // send scheduled probes to the retired AWS Core.
          const cloudflarePrimary = await isCloudflareHttpPrimary();
          const result = cloudflarePrimary
            ? { checked: 0, ok: 0, errors: 0, queued: 0, skipped: true,
                provider: "cloudflare-regional-edge" }
            : await withCycleLock("cron-monitor", 120, async () => {
                const { runDueChecks } = await import("@/lib/monitoring.server");
                return runDueChecks(5);
              });
          // Partner status checks run independently of DNS. No mass alert is
          // sent unless the official API contract has been validated and two
          // consecutive provider-reported state changes are confirmed.
          let applicationPartners: unknown = null;
          try {
            const {runDueApplicationPartnerChecks}=await import("@/lib/app-partner-monitor.server");
            applicationPartners=await withCycleLock("cron-app-partners",90,
              ()=>runDueApplicationPartnerChecks(3));
          }catch(e){
            console.error("[cron/monitor] app partners",e instanceof Error?e.name:"unknown");
          }
          let telegramOutbox: unknown = null;
          try {
            const { processTelegramOutbox } = await import("@/lib/telegram-outbox.server");
            telegramOutbox = await withCycleLock("telegram-outbox", 60, () => processTelegramOutbox(10));
          } catch (e) {
            console.error("[cron/monitor] telegram outbox", e instanceof Error ? e.message : "unknown");
          }
          return Response.json({ ok: true, ...result, applicationPartners, telegramOutbox }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          console.error("[cron/monitor] failed", error instanceof Error ? error.name : "unknown");
          return Response.json({ ok: false, error: "monitor_cycle_failed" }, { status: 503 });
        }
      },
    },
  },
});
