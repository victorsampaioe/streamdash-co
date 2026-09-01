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
  const { runPerfBatch } = await import("@/lib/perf.server");
  const batch = Number(process.env.PERF_BATCH_SIZE ?? 5);
  const result = await runPerfBatch(Number.isFinite(batch) && batch > 0 ? batch : 5);
  return { ok: result.errors.length === 0, ...result };
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
