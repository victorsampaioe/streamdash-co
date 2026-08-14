import { createFileRoute } from "@tanstack/react-router";

/**
 * Healthcheck público (usado pelo Docker e pelo Caddy). Não expõe dados.
 *
 * `?deep=1` executa um diagnóstico da configuração de produção:
 * apenas booleanos/prefixos — nunca o valor das chaves.
 */
async function deepCheck() {
  const url = process.env.SUPABASE_URL ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const isCore = process.env.IS_CORE === "true";

  // Modo worker: o Core AWS NÃO acessa o banco. Ele apenas executa tarefas
  // recebidas em /api/public/core/task e devolve JSON; o Painel persiste.
  const workerMode = isCore;

  const env = {
    IS_CORE: isCore,
    WORKER: workerMode,
    DATABASE: workerMode ? false : Boolean(url && service),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    CORE_API_URL: process.env.CORE_API_URL ?? null,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? null,
  };

  const missing = [
    ...(!process.env.CRON_SECRET ? ["CRON_SECRET"] : []),
    ...(!workerMode && !url ? ["SUPABASE_URL"] : []),
    ...(!workerMode && !service ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];

  const database: Record<string, unknown> = workerMode
    ? { required: false, note: "Worker externo: nenhuma credencial de banco é necessária." }
    : { required: true, ok: false, client: "service_role" };

  if (!workerMode && !missing.length) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { count, error } = await supabaseAdmin
        .from("servers")
        .select("id", { count: "exact", head: true });
      if (error) database.error = error.message;
      else {
        database.ok = true;
        database.servers = count ?? 0;
      }
    } catch (e: any) {
      database.error = e?.message ?? "unknown";
    }
  }

  return {
    status: missing.length === 0 && (workerMode || database.ok) ? "ok" : "degraded",
    service: workerMode ? "stream-monitor-core-worker" : "stream-monitor-panel",
    role: workerMode ? "worker" : "panel",
    env,
    missing,
    database,
    endpoints: workerMode
      ? ["/api/public/core/task", "/api/public/core/stream"]
      : ["/api/public/core/report"],
    time: new Date().toISOString(),
  };
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deep = new URL(request.url).searchParams.get("deep");
        if (deep) {
          const body = await deepCheck();
          return Response.json(body, {
            status: body.status === "ok" ? 200 : 503,
            headers: { "cache-control": "no-store" },
          });
        }
        return Response.json(
          {
            status: "ok",
            service: "stream-monitor-core",
            isCore: process.env.IS_CORE === "true",
            worker: process.env.IS_CORE === "true",
            database: process.env.IS_CORE === "true" ? false : Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
            hasSecret: Boolean(process.env.CRON_SECRET),
            time: new Date().toISOString(),
          },

          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
