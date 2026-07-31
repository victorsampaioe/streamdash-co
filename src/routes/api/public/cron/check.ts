import { createFileRoute } from "@tanstack/react-router";

function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (apikey && process.env.SUPABASE_PUBLISHABLE_KEY && apikey === process.env.SUPABASE_PUBLISHABLE_KEY) return true;
  return false;
}

async function run() {
  const { runDueChecks } = await import("@/lib/monitoring.server");
  const { notifyNewlyExpiredSubscriptions } = await import("@/lib/admin-telegram.server");
  const { runDueIptvSyncs } = await import("@/lib/iptv.server");
  const { syncKumaStatuses, provisionPendingServers } = await import("@/lib/kuma.server");
  const { runDueDnsChecks } = await import("@/lib/dns.server");
  const [checks, expired, iptv, kuma, kumaProv, dns] = await Promise.all([
    runDueChecks(),
    notifyNewlyExpiredSubscriptions().catch(() => ({ notified: 0 })),
    runDueIptvSyncs().catch(() => ({ synced: 0, errors: 0 })),
    syncKumaStatuses().catch(() => ({ synced: 0 })),
    provisionPendingServers().catch(() => ({ provisioned: 0 })),
    runDueDnsChecks().catch(() => ({ checked: 0, errors: 0 })),
  ]);
  return {
    ...checks,
    expiredNotified: expired.notified,
    iptvSynced: iptv.synced,
    iptvErrors: iptv.errors,
    kumaSynced: kuma.synced,
    kumaProvisioned: (kumaProv as any).provisioned ?? 0,
    dnsChecked: dns.checked,
    dnsErrors: dns.errors,
  };
}


export const Route = createFileRoute("/api/public/cron/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try { return Response.json(await run()); }
        catch (e: any) { return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 }); }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try { return Response.json(await run()); }
        catch (e: any) { return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 }); }
      },
    },
  },
});
