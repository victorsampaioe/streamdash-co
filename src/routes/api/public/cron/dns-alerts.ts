import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request) {
  const configured = process.env.CRON_SECRET;
  const submitted = request.headers.get("authorization");
  if (!configured || submitted !== `Bearer ${configured}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { withCycleLock } = await import("@/lib/job-lock.server");
    const { retryConfirmedDnsAlerts } = await import("@/lib/dns-alert-retry.server");
    const result = await withCycleLock("cron-dns-alerts", 45, () => retryConfirmedDnsAlerts(5));
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
