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
          const { runDueChecks } = await import("@/lib/monitoring.server");
          // Five parallel probes bound each cycle. Confirming a real outage
          // can still take longer than a simple successful health check.
          const result = await withCycleLock("cron-monitor", 120, () => runDueChecks(5));
          let telegramOutbox: unknown = null;
          try {
            const { processTelegramOutbox } = await import("@/lib/telegram-outbox.server");
            telegramOutbox = await withCycleLock("telegram-outbox", 60, () => processTelegramOutbox(10));
          } catch (e) {
            console.error("[cron/monitor] telegram outbox", e instanceof Error ? e.message : "unknown");
          }
          return Response.json({ ok: true, ...result, telegramOutbox }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          console.error("[cron/monitor] failed", error instanceof Error ? error.name : "unknown");
          return Response.json({ ok: false, error: "monitor_cycle_failed" }, { status: 503 });
        }
      },
    },
  },
});
