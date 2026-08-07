import { createFileRoute } from "@tanstack/react-router";

function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (apikey && process.env.SUPABASE_PUBLISHABLE_KEY && apikey === process.env.SUPABASE_PUBLISHABLE_KEY) return true;
  return false;
}

async function run() {
  // O scheduler roda no Core AWS: se este processo for apenas o painel,
  // encaminha o ciclo para core.streammonitor.site.
  const { useCore, coreApiUrl } = await import("@/lib/core-api.server");
  if (useCore()) {
    const res = await fetch(`${coreApiUrl()}/api/public/cron/check`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
    });
    if (res.ok) return { forwardedToCore: true, ...(await res.json()) };
    console.warn("[cron] Core indisponível, executando localmente:", res.status);
  }
  const { runDueChecks } = await import("@/lib/monitoring.server");
  const { notifyNewlyExpiredSubscriptions, notifyExpiredAccessUsers } = await import("@/lib/admin-telegram.server");
  const { runDueIptvSyncs } = await import("@/lib/iptv.server");
  const { syncKumaStatuses, provisionPendingServers } = await import("@/lib/kuma.server");
  const { runDueDnsChecks } = await import("@/lib/dns.server");
  const { reconcilePendingPayments } = await import("@/lib/mercadopago.server");
  const { migratePlaintextCredentials } = await import("@/lib/iptv-credentials.server");
  const { runDueContentScans } = await import("@/lib/content-monitor.server");
  const { syncServersPauseState } = await import("@/lib/service-status.server");
  // Primeiro sincroniza o estado de pausa: contas expiradas ficam marcadas
  // como pausadas e contas reativadas voltam sozinhas para o monitoramento.
  const pauseSync = await syncServersPauseState().catch(() => ({ paused: 0, resumed: 0 }));
  const [checks, expired, iptv, kuma, kumaProv, dns, payments, contents] = await Promise.all([
    runDueChecks(),
    notifyNewlyExpiredSubscriptions().catch(() => ({ notified: 0 })),
    runDueIptvSyncs().catch(() => ({ synced: 0, errors: 0 })),
    syncKumaStatuses().catch(() => ({ synced: 0 })),
    provisionPendingServers().catch(() => ({ provisioned: 0 })),
    runDueDnsChecks().catch(() => ({ checked: 0, errors: 0 })),
    reconcilePendingPayments().catch(() => ({ checked: 0, approved: 0 })),
    runDueContentScans().catch(() => ({ servers: 0, tested: 0 })),
  ]);
  // Aviso único no Telegram para contas com acesso encerrado.
  const expiryNotice = await notifyExpiredAccessUsers().catch(() => ({ sent: 0, skipped: 0 }));
  // Rede de segurança: criptografa credenciais Xtream legadas em texto puro.
  const encrypted = await migratePlaintextCredentials(50).catch(() => ({ migrated: 0 }));
  return {
    ...checks,
    expiredNotified: expired.notified,
    expiryNoticesSent: expiryNotice.sent,
    iptvSynced: iptv.synced,
    iptvErrors: iptv.errors,
    kumaSynced: kuma.synced,
    kumaProvisioned: (kumaProv as any).provisioned ?? 0,
    dnsChecked: dns.checked,
    dnsErrors: dns.errors,
    paymentsChecked: payments.checked,
    paymentsApproved: payments.approved,
    credentialsEncrypted: encrypted.migrated,
    contentServersScanned: contents.servers,
    contentsTested: contents.tested,
    serversPaused: pauseSync.paused,
    serversResumed: pauseSync.resumed,
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
