import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request) {
  const configured = process.env.CRON_SECRET;
  const submitted = request.headers.get("authorization");
  if (!configured || submitted !== `Bearer ${configured}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { withCycleLock } = await import("@/lib/job-lock.server");
    const { retryConfirmedDnsAlerts, retryRecoveredDnsAlerts } = await import("@/lib/dns-alert-retry.server");
    const result = await withCycleLock("cron-dns-alerts", 55, async () => {
      // OFFLINE and ONLINE are independently delivered and idempotent per
      // Telegram channel. One failed direction cannot suppress the other.
      const [offline, online] = await Promise.allSettled([
        retryConfirmedDnsAlerts(5),
        retryRecoveredDnsAlerts(5),
      ]);
      if (offline.status === "rejected") console.error("[dns-alerts] Offline retry failed", offline.reason);
      if (online.status === "rejected") console.error("[dns-alerts] Recovery retry failed", online.reason);
      return {
        offline: offline.status === "fulfilled" ? offline.value : { failed: 1, attempted: 0 },
        online: online.status === "fulfilled" ? online.value : { failed: 1, attempted: 0 },
        deliveryErrors: Number(offline.status === "rejected") + Number(online.status === "rejected"),
      };
    });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[dns-alerts] Retry cycle failed", err instanceof Error ? err.name : "unknown");
    return Response.json({ ok: false, error: "dns_alert_retry_failed" }, { status: 503 });
  }
}

export const Route = createFileRoute("/api/public/cron/dns-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
    },
  },
});
