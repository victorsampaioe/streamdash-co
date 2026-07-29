import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "generate_report",
  title: "Gerar relatório de DNS",
  description:
    "Gera um relatório consolidado das DNS do usuário no período informado: quantidade por status, total de incidentes, latência média e ranking dos servidores mais instáveis.",
  inputSchema: {
    days: z.number().int().min(1).max(90).optional().describe("Período em dias (padrão 7)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    const period = days ?? 7;
    const since = new Date(Date.now() - period * 86_400_000).toISOString();

    const [{ data: servers }, { data: incidents }, { data: checks }] = await Promise.all([
      auth.supabase.from("servers").select("id, name, current_status, last_latency_ms"),
      auth.supabase.from("incidents").select("server_id, started_at, ended_at").gte("started_at", since),
      auth.supabase.from("checks").select("server_id, status, latency_ms, checked_at").gte("checked_at", since),
    ]);

    const byStatus = { up: 0, down: 0, degraded: 0, unknown: 0 } as Record<string, number>;
    for (const s of servers ?? []) byStatus[s.current_status] = (byStatus[s.current_status] ?? 0) + 1;

    const incidentsByServer = new Map<string, number>();
    for (const i of incidents ?? []) incidentsByServer.set(i.server_id, (incidentsByServer.get(i.server_id) ?? 0) + 1);
    const ranking = (servers ?? [])
      .map((s) => ({ name: s.name, incidents: incidentsByServer.get(s.id) ?? 0 }))
      .sort((a, b) => b.incidents - a.incidents)
      .slice(0, 10);

    const latencies = (checks ?? []).map((c) => c.latency_ms).filter((n): n is number => typeof n === "number");
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    const report = {
      period_days: period,
      total_dns: servers?.length ?? 0,
      by_status: byStatus,
      total_incidents: incidents?.length ?? 0,
      average_latency_ms: avgLatency,
      top_unstable: ranking,
    };
    await logMcpAction(ctx, auth.userId, "generate_report", { days: period }, "ok");
    return jsonResult(report, `Relatório dos últimos ${period} dia(s).`);
  },
});
