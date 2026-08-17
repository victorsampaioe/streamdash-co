import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Endpoint executado no Core AWS (core.streammonitor.site).
 * Recebe as tarefas de monitoramento delegadas pelo painel e roda os motores
 * (DNS, HTTP, IPTV, conteúdos, Telegram) usando o IP da VPS.
 *
 * Autenticação: header x-cron-secret === CRON_SECRET.
 * A posse do servidor já é validada no painel antes da delegação.
 */
const Body = z.object({
  task: z.enum([
    "check",
    "dns",
    "iptv-detect",
    "iptv-validate",
    "iptv-sync",
    "iptv-batch-sync",
    "iptv-ua-test",
    "content-scan",
    "content-diagnostic",
    "content-diagnostic-cancel",
    "iptv-categories",
    "get-series-seasons",
    "telegram-broadcast",
    "radar-job-step",
    "iptv-player-proxy",
    "iptv-stream-proxy",
    // Sondas STATELESS (worker externo, sem banco)
    "probe-http",
    "probe-dns",
    "probe-iptv-login",
  ]),
  serverId: z.string().uuid().optional(),
  serverIds: z.array(z.string().uuid()).optional(),
  host: z.string().min(1).max(255).optional(),
  username: z.string().max(200).nullable().optional(),
  password: z.string().max(200).nullable().optional(),
  mode: z.enum(["smart", "full"]).optional(),
  message: z.string().min(1).max(3500).optional(),
  contentId: z.string().optional(),
  contentType: z.string().optional(),
  userId: z.string().uuid().nullable().optional(),
  seriesId: z.string().optional(),
  seasonNum: z.number().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret");
  
  // ADMIN MASTER bypass (victorsampaio133@gmail.com)
  // This endpoint is for internal task delegation. 
  // We keep it secured by CRON_SECRET for system integrity.
  
  return Boolean(secret && given && given === secret);
}

/**
 * Modo worker (IS_CORE=true): a VPS não tem credenciais do banco.
 * Só executa tarefas stateless — tudo que precisa de banco fica no Painel.
 */
const WORKER_TASKS = new Set<z.infer<typeof Body>["task"]>([
  "probe-http",
  "probe-dns",
  "probe-iptv-login",
  "iptv-detect",
  "iptv-validate",
  "iptv-ua-test",
]);

function isWorker(): boolean {
  return process.env.IS_CORE === "true";
}

async function execute(input: z.infer<typeof Body>) {
  switch (input.task) {
    // ---- Sondas stateless: não tocam o banco, devolvem JSON puro ----
    case "probe-http": {
      const { probeHostStateless } = await import("@/lib/core-probes.server");
      return await probeHostStateless(input.host!);
    }
    case "probe-dns": {
      const { probeDnsStateless } = await import("@/lib/core-probes.server");
      return await probeDnsStateless(input.host!, Number(input.options?.["recentChanges"] ?? 0));
    }
    case "probe-iptv-login": {
      const { probeIptvLoginStateless } = await import("@/lib/core-probes.server");
      return await probeIptvLoginStateless(input.host!, input.username!, input.password!);
    }
    case "check": {
      const { runCheckForServer } = await import("@/lib/monitoring.server");
      return await runCheckForServer(input.serverId!);
    }
    case "dns": {
      const { runDnsCheck } = await import("@/lib/dns.server");
      return await runDnsCheck(input.serverId!);
    }
    case "iptv-detect": {
      const { detectIptvKind } = await import("@/lib/iptv.server");
      return await detectIptvKind(input.host!, input.username ?? null, input.password ?? null);
    }
    case "iptv-validate": {
      const { validateXtreamLogin } = await import("@/lib/iptv.server");
      return await validateXtreamLogin(input.host!, input.username!, input.password!);
    }
    case "iptv-sync": {
      const { runIptvSync } = await import("@/lib/iptv.server");
      return await runIptvSync(input.serverId!, { mode: input.mode ?? "smart", force: true });
    }
    case "iptv-batch-sync": {
      const { runIptvBatchSync } = await import("@/lib/iptv.server");
      return await runIptvBatchSync(input.serverIds || [], { mode: input.mode ?? "full" });
    }
    case "iptv-ua-test": {
      const { comparePlayerApiUserAgents } = await import("@/lib/iptv.server");
      return await comparePlayerApiUserAgents(input.host!, input.username!, input.password!);
    }
    case "content-scan": {
      const { runContentScan } = await import("@/lib/content-monitor.server");
      return await runContentScan(input.serverId!, (input.options ?? {}) as any);
    }
    case "content-diagnostic": {
      const { runContentDiagnostic } = await import("@/lib/diagnostics.server");
      return await runContentDiagnostic(input.userId ?? null, input.serverId!, input.contentId!, input.contentType as any);
    }
    case "content-diagnostic-cancel": {
      const { requestDiagnosticCancel } = await import("@/lib/diagnostics.server");
      return await requestDiagnosticCancel(input.serverId!, input.contentId!, input.contentType as any);
    }
    case "iptv-categories": {
      const { getCategoryNames } = await import("@/lib/diagnostics-categories.server");
      return await getCategoryNames(input.serverId!);
    }
    case "get-series-seasons": {
      const { getSeriesDataOnCore } = await import("@/lib/iptv.server");
      return await getSeriesDataOnCore(input.serverId!, input.seriesId!, input.seasonNum);
    }
    case "radar-job-step": {
      const { runRadarJobStep, enrichTmdbPending, ensureAutoRadarJob } = await import("@/lib/radar-jobs.server");
      const auto = await ensureAutoRadarJob();
      const step = await runRadarJobStep();
      const tmdb = await enrichTmdbPending(60);
      return { auto, step, tmdb };
    }
    case "telegram-broadcast": {
      const { broadcastToTelegramSubscribers } = await import("@/lib/telegram-broadcast.server");
      return await broadcastToTelegramSubscribers(input.message!);
    }
    case "iptv-player-proxy": {
      // Proxy de dados Xtream para o Web Player (CORS bypass)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: server } = await supabaseAdmin.from("servers").select("host").eq("id", input.serverId!).single();
      if (!server) throw new Error("Servidor não encontrado");

      // Credenciais do cliente final vêm no payload; senão usa as do servidor.
      let username = input.username ?? null;
      let password = input.password ?? null;
      if (!username || !password) {
        const { getIptvCredentials } = await import("@/lib/iptv-credentials.server");
        const creds = await getIptvCredentials(input.serverId!);
        username = creds.username;
        password = creds.password;
      }
      if (!username || !password) throw new Error("Credenciais não configuradas");

      const { fetchXtreamCatalog } = await import("@/lib/player.server");
      const action = (input.options?.action as string) || "get_live_categories";
      const started = Date.now();
      console.log(`[CATALOG_DEBUG][core] servidor=${input.serverId} host=${server.host} usuario=${username} action=${action}`);

      try {
        const json = await fetchXtreamCatalog(input.serverId!, { username, password }, {
          action,
          categoryId: input.options?.categoryId as string | undefined,
          contentId: input.options?.contentId as string | undefined,
          offset: input.options?.offset as number | undefined,
          limit: input.options?.limit as number | undefined,
        });
        console.log(
          `[CATALOG_DEBUG][core] OK action=${action} ms=${Date.now() - started} quantidade=${Array.isArray(json) ? json.length : json && typeof json === "object" ? Object.keys(json).length : 0}`
        );
        return json;
      } catch (e: any) {
        console.error(`[CATALOG_DEBUG][core] ERRO action=${action} ms=${Date.now() - started} erro=${e?.message ?? e}`);
        throw e;
      }
    }

    case "iptv-stream-proxy": {
      // Esta tarefa é tratada por uma rota dedicada em /api/public/core/stream
      // para suportar streaming de dados binários grandes que não cabem em JSON.
      return { info: "Use /api/public/core/stream for streaming" };
    }
  }
}

export const Route = createFileRoute("/api/public/core/task")({
  server: {
    handlers: {
      // Diagnóstico de deploy: confirma que esta rota existe no build atual.
      GET: async () =>
        Response.json({
          ok: true,
          route: "/api/public/core/task",
          isCore: process.env.IS_CORE === "true",
          hasSecret: Boolean(process.env.CRON_SECRET),
          methods: ["GET", "POST"],
        }),
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Forbidden", { status: 403 });
        let input: z.infer<typeof Body>;
        try {
          input = Body.parse(await request.json());
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (isWorker() && !WORKER_TASKS.has(input.task)) {
          return Response.json(
            {
              success: false,
              error: `Tarefa "${input.task}" exige acesso ao banco e não roda no worker. Execute no Painel.`,
              workerOnly: [...WORKER_TASKS],
            },
            { status: 501 },
          );
        }
        try {
          const result = await execute(input);
          return Response.json({ success: true, result });
        } catch (e: any) {
          return Response.json(
            { success: false, error: e?.message ?? "unknown" },
            { status: 500 },
          );
        }
      },
    },
  },
});
