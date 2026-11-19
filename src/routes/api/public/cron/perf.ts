import { createFileRoute } from "@tanstack/react-router";

/**
 * Ciclo de medição de performance (delay real) dos servidores IPTV.
 * Executado pelo pg_cron / Core AWS. Processa apenas um pequeno lote por
 * chamada para não sobrecarregar o Core nem os servidores monitorados.
 */
function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  return Boolean(cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET);
}

async function run() {
  if (process.env.IS_CORE === "true") {
    return { ok: true, skipped: true, reason: "worker mode: ciclo roda no Painel" };
  }
  const { isCloudflareHttpPrimary } = await import("@/lib/cloudflare-http-mode.server");
  if (await isCloudflareHttpPrimary()) {
    // Cloudflare already records edge HTTP latency in region_checks; do not
    // start the old AWS-dependent player/performance probe pipeline.
    return {ok:true,skipped:true,provider:"cloudflare-edge",reason:"legacy_perf_retired"};
  }
  const { runPerfBatch } = await import("@/lib/perf.server");
  const batch = Number(process.env.PERF_BATCH_SIZE ?? 5);
  const { tested, ok: succeeded, errors } = await runPerfBatch(
    Number.isFinite(batch) && batch > 0 ? batch : 5,
  );
  return { ok: errors.length === 0, tested, succeeded, errors };
}

export const Route = createFileRoute("/api/public/cron/perf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          const { withCycleLock } = await import("@/lib/job-lock.server");
          const result = await withCycleLock("cron-perf", 600, run);
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
        }
      },
    },
  },
});
