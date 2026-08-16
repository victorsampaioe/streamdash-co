import { createFileRoute } from "@tanstack/react-router";

/**
 * Ciclo de background do Radar IPTV (Filmes VOD + Séries).
 * Executado periodicamente pelo Core AWS / pg_cron.
 * Retomável: cada chamada processa um lote pequeno e devolve o progresso.
 */
function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  return false;
}

async function run() {
  const errors: string[] = [];

  // Worker externo (Core AWS) não tem banco: o ciclo do Radar roda sempre no Painel.
  if (process.env.IS_CORE === "true") {
    return { ok: true, skipped: true, reason: "worker mode: ciclo roda no Painel" };
  }

  // Deduplicação de servidores lógicos: roda no painel (1x/dia), independente do Core.
  let clusters: unknown = null;
  try {
    const { ensureLogicalClusters } = await import("@/lib/radar-jobs.server");
    clusters = await ensureLogicalClusters();
  } catch (e: any) {
    errors.push(`clusters: ${e?.message}`);
  }


  const { runRadarJobStep, enrichTmdbPending, ensureAutoRadarJob, reclaimStuckRadarWork } =
    await import("@/lib/radar-jobs.server");

  let recovered: unknown = null;
  try {
    recovered = await reclaimStuckRadarWork();
  } catch (e: any) {
    errors.push(`recover: ${e?.message}`);
  }




  let auto: unknown = null;
  try {
    auto = await ensureAutoRadarJob();
  } catch (e: any) {
    errors.push(`auto: ${e?.message}`);
  }

  let step: unknown = null;
  try {
    step = await runRadarJobStep();
  } catch (e: any) {
    errors.push(`step: ${e?.message}`);
  }

  let tmdb: unknown = null;
  try {
    tmdb = await enrichTmdbPending(60);
  } catch (e: any) {
    errors.push(`tmdb: ${e?.message}`);
  }

  return { ok: errors.length === 0, recovered, clusters, auto, step, tmdb, ...(errors.length ? { errors } : {}) };
}

/** Um ciclo por vez: evita que o pg_cron empilhe execuções do Radar. */
async function guardedRun() {
  const { withCycleLock } = await import("@/lib/job-lock.server");
  return await withCycleLock("cron-radar", 300, run);
}

export const Route = createFileRoute("/api/public/cron/radar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          return Response.json(await guardedRun());
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 200 });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          return Response.json(await guardedRun());
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 200 });
        }
      },
    },
  },
});

