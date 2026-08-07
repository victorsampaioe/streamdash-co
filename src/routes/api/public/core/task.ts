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
    "iptv-ua-test",
    "content-scan",
    "telegram-broadcast",
  ]),
  serverId: z.string().uuid().optional(),
  host: z.string().min(1).max(255).optional(),
  username: z.string().max(200).nullable().optional(),
  password: z.string().max(200).nullable().optional(),
  mode: z.enum(["smart", "full"]).optional(),
  message: z.string().min(1).max(3500).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret");
  return Boolean(secret && given && given === secret);
}

async function execute(input: z.infer<typeof Body>) {
  switch (input.task) {
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
    case "iptv-ua-test": {
      const { comparePlayerApiUserAgents } = await import("@/lib/iptv.server");
      return await comparePlayerApiUserAgents(input.host!, input.username!, input.password!);
    }
    case "content-scan": {
      const { runContentScan } = await import("@/lib/content-monitor.server");
      return await runContentScan(input.serverId!, (input.options ?? {}) as any);
    }
    case "telegram-broadcast": {
      const { broadcastToTelegramSubscribers } = await import("@/lib/telegram-broadcast.server");
      return await broadcastToTelegramSubscribers(input.message!);
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
        try {
          return Response.json(await execute(input));
        } catch (e: any) {
          return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});
