import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Retorno do Core AWS → Painel.
 *
 * O Core é um worker STATELESS: executa a tarefa pesada de rede e devolve o
 * resultado aqui. Toda a persistência no banco acontece neste endpoint, no
 * backend gerenciado — o Core nunca acessa o Supabase diretamente.
 *
 * Autenticação: header x-cron-secret === CRON_SECRET.
 */

const ProbeResult = z.object({
  status: z.enum(["up", "down", "degraded", "unknown"]),
  httpStatus: z.number().int().nullable().optional(),
  latency: z.number().nullable().optional(),
  dnsIp: z.string().max(120).nullable().optional(),
  error: z.string().max(1000).nullable().optional(),
  sslDays: z.number().nullable().optional(),
});

const Body = z.object({
  kind: z.enum(["check", "dns", "iptv", "radar", "log"]),
  /** Log de auditoria criado pelo painel ao delegar a tarefa. */
  logId: z.string().uuid().nullable().optional(),
  taskType: z.string().max(80).optional(),
  serverId: z.string().uuid().nullable().optional(),
  status: z.enum(["success", "failed", "timeout"]).default("success"),
  executionTimeMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  error: z.string().max(2000).nullable().optional(),
  result: ProbeResult.optional(),
  /** Payload livre (DNS / IPTV / Radar) apenas para auditoria. */
  data: z.unknown().optional(),
});

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("x-cron-secret");
  
  // ADMIN MASTER bypass (victorsampaio133@gmail.com)
  // Note: This endpoint is usually called by the Core Worker using CRON_SECRET.
  // We keep it strict but allow development/testing if needed.
  
  return Boolean(secret && given && given === secret);
}

function truncate(value: unknown, max = 40_000): any {
  try {
    const json = JSON.stringify(value ?? null);
    if (json && json.length > max) return { truncated: true, preview: json.slice(0, max) };
    return value ?? null;
  } catch {
    return null;
  }
}

async function persistCheck(
  admin: any,
  serverId: string,
  p: z.infer<typeof ProbeResult>,
) {
  const row = {
    server_id: serverId,
    status: p.status,
    http_status: p.httpStatus ?? null,
    latency_ms: p.latency ?? null,
    error: p.error ?? null,
  };
  await admin.from("checks").insert({
    ...row,
    dns_resolved_ip: p.dnsIp ?? null,
    ssl_days_remaining: p.sslDays ?? null,
  });
  await admin.from("region_checks").insert({ ...row, region_code: "origin" });
  await admin
    .from("servers")
    .update({
      current_status: p.status,
      last_checked_at: new Date().toISOString(),
      last_latency_ms: p.latency ?? null,
      ssl_days_remaining: p.sslDays ?? null,
    })
    .eq("id", serverId);
}

export const Route = createFileRoute("/api/public/core/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
        }

        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch (e: any) {
          return Response.json(
            { success: false, error: "invalid_payload", detail: e?.message?.slice(0, 300) },
            { status: 400 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (parsed.kind === "check" && parsed.serverId && parsed.result) {
            await persistCheck(supabaseAdmin, parsed.serverId, parsed.result);
          }

          // Auditoria: fecha o log pendente criado na delegação, ou cria um novo.
          const audit = {
            task_type: parsed.taskType ?? parsed.kind,
            status: parsed.status,
            response_data: truncate(parsed.result ?? parsed.data),
            execution_time_ms: parsed.executionTimeMs ?? null,
            error_message: parsed.error ?? null,
          };

          if (parsed.logId) {
            await supabaseAdmin.from("core_execution_logs").update(audit).eq("id", parsed.logId);
          } else {
            await supabaseAdmin.from("core_execution_logs").insert({
              ...audit,
              endpoint: "/api/public/core/report",
              request_payload: { serverId: parsed.serverId ?? null, kind: parsed.kind },
            });
          }

          return Response.json(
            { success: true, persisted: parsed.kind },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (e: any) {
          console.error("[core/report] falha ao persistir:", e?.message);
          return Response.json(
            { success: false, error: e?.message?.slice(0, 300) ?? "persist_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
