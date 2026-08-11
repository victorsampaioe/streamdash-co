import { createFileRoute } from "@tanstack/react-router";

/**
 * Ciclo de background do Radar IPTV (Filmes VOD + Séries).
 * Executado periodicamente pelo Core AWS / pg_cron.
 * Retomável: cada chamada processa um lote pequeno e devolve o progresso.
 */
function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (apikey && process.env.SUPABASE_PUBLISHABLE_KEY && apikey === process.env.SUPABASE_PUBLISHABLE_KEY) return true;
  return false;
}

async function run() {
  const errors: string[] = [];

  const { useCore, coreJsonPost } = await import("@/lib/core-api.server");
  if (useCore()) {
    try {
      const out = await coreJsonPost<Record<string, unknown>>("/api/public/cron/radar", 25_000);
      return { forwardedToCore: true, ...out };
    } catch (e: any) {
      // Core indisponível ou com build antigo → processa localmente (não pode parar o Radar).
      errors.push(`core: ${e?.message ?? "fetch failed"}`);
    }
  }

  const { runRadarJobStep, enrichTmdbPending, ensureAutoRadarJob, reclaimStuckRadarWork } = await import(
    "@/lib/radar-jobs.server"
  );

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

  return { ok: errors.length === 0, auto, step, tmdb, ...(errors.length ? { errors } : {}) };
}

export const Route = createFileRoute("/api/public/cron/radar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          return Response.json(await run());
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 200 });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try {
          return Response.json(await run());
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 200 });
        }
      },
    },
  },
});
