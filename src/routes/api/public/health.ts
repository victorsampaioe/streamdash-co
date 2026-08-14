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
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

  const env = {
    SUPABASE_URL: url || null,
    SUPABASE_SERVICE_ROLE_KEY: service ? `${service.slice(0, 6)}…(${service.length})` : null,
    SUPABASE_PUBLISHABLE_KEY: Boolean(publishable),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    IS_CORE: process.env.IS_CORE === "true",
    CORE_API_URL: process.env.CORE_API_URL ?? null,
  };

  // O acesso ao banco no Core é sempre feito com a SERVICE ROLE (ignora RLS).
  // A publishable key só é usada para autenticação de chamadas do painel,
  // portanto não deve bloquear a checagem de banco/RPC.
  const dbMissing = [
    ...(!url ? ["SUPABASE_URL"] : []),
    ...(!service ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  const missing = [
    ...dbMissing,
    ...(!publishable ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ...(!process.env.CRON_SECRET ? ["CRON_SECRET"] : []),
  ];

  const database: Record<string, unknown> = { ok: false, client: "service_role" };
  if (!dbMissing.length) {
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
      // RPCs usadas pelo monitoramento — executadas com service role
      const rpc = await supabaseAdmin.rpc("get_admin_stats");
      database.rpc_get_admin_stats = rpc.error ? rpc.error.message : "ok";
    } catch (e: any) {
      database.error = e?.message ?? "unknown";
    }
  } else {
    database.error = `Variáveis ausentes: ${dbMissing.join(", ")}`;
  }


  return {
    status: missing.length === 0 && database.ok ? "ok" : "degraded",
    service: "stream-monitor-core",
    env,
    missing,
    database,
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
            hasSecret: Boolean(process.env.CRON_SECRET),
            time: new Date().toISOString(),
          },

          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
