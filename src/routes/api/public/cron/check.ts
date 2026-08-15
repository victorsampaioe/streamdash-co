import { createFileRoute } from "@tanstack/react-router";

function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (apikey && process.env.SUPABASE_PUBLISHABLE_KEY && apikey === process.env.SUPABASE_PUBLISHABLE_KEY) return true;
  return false;
}

/** Garante que a instância tem o banco original do Lovable configurado. */
function missingEnv(): string[] {
  return [
    ...(!process.env.SUPABASE_URL ? ["SUPABASE_URL"] : []),
    ...(!process.env.SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T, errors: string[]): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    errors.push(`${label}: ${e?.message ?? "unknown"}`);
    return fallback;
  }
}

async function run() {
  const errors: string[] = [];

  // Arquitetura worker externo: o ciclo roda sempre no Painel (dono do banco).
  // O Core AWS é acionado tarefa a tarefa (sondas stateless) via /api/public/core/task.
  if (process.env.IS_CORE === "true") {
    return { ok: true, skipped: true, reason: "worker mode: ciclo roda no Painel" };
  }


  const missing = missingEnv();
  if (missing.length) {
    return {
      ok: false,
      skipped: true,
      error: `Configuração do banco incompleta nesta instância: ${missing.join(", ")}. Preencha o .env da VPS com o Supabase do projeto Lovable.`,
    };
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
  const pauseSync = await safe("pauseSync", syncServersPauseState, { paused: 0, resumed: 0 }, errors);
  const [checks, expired, iptv, kuma, kumaProv, dns, payments, contents] = await Promise.all([
    safe("checks", runDueChecks, {} as any, errors),
    safe("expired", notifyNewlyExpiredSubscriptions, { notified: 0 }, errors),
    safe("iptv", runDueIptvSyncs, { synced: 0, errors: 0 }, errors),
    safe("kuma", syncKumaStatuses, { synced: 0 }, errors),
    safe("kumaProvision", provisionPendingServers, { provisioned: 0 } as any, errors),
    safe("dns", runDueDnsChecks, { checked: 0, errors: 0 }, errors),
    safe("payments", reconcilePendingPayments, { checked: 0, approved: 0 }, errors),
    safe("contents", runDueContentScans, { servers: 0, tested: 0 }, errors),
  ]);
  // Aviso único no Telegram para contas com acesso encerrado.
  const expiryNotice = await safe("expiryNotice", notifyExpiredAccessUsers, { sent: 0, skipped: 0 }, errors);
  // Rede de segurança: criptografa credenciais Xtream legadas em texto puro.
  const encrypted = await safe("encrypt", () => migratePlaintextCredentials(50), { migrated: 0 }, errors);

  return {
    ok: errors.length === 0,
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
    ...(errors.length ? { errors } : {}),
  };
}

/** Fecha logs presos em "running" (tarefas que nunca finalizaram). */
async function reapStaleLogs() {
  if (process.env.IS_CORE === "true") return { reaped: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("core_execution_logs")
    .update({ status: "timeout", error_message: "Tarefa não finalizou (log órfão)" })
    .eq("status", "running")
    .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .select("id");
  return { reaped: data?.length ?? 0 };
}

/** Um ciclo por vez: o pg_cron dispara a cada minuto e o ciclo pode demorar mais. */
async function guardedRun() {
  const { withCycleLock } = await import("@/lib/job-lock.server");
  return await withCycleLock("cron-check", 300, async () => {
    const reaped = await reapStaleLogs().catch(() => ({ reaped: 0 }));
    const out = await run();
    return { ...out, ...reaped };
  });
}

export const Route = createFileRoute("/api/public/cron/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try { return Response.json(await guardedRun()); }
        catch (e: any) { return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 200 }); }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try { return Response.json(await guardedRun()); }
        catch (e: any) { return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 200 }); }
      },

    },
  },
});
