import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "list_alerts",
  title: "Listar alertas e ocorrências",
  description:
    "Lista incidentes (quedas) das DNS do usuário. Por padrão retorna as últimas 24 horas; use 'hours' para outro período.",
  inputSchema: {
    hours: z.number().int().min(1).max(720).optional().describe("Período em horas (padrão 24, máx. 720)."),
    only_open: z.boolean().optional().describe("Retornar apenas incidentes ainda em aberto."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ hours, only_open }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    const since = new Date(Date.now() - (hours ?? 24) * 3600 * 1000).toISOString();
    let q = auth.supabase
      .from("incidents")
      .select("id, server_id, reason, started_at, ended_at, servers!inner(name, host, owner_id)")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(200);
    if (only_open) q = q.is("ended_at", null);
    const { data, error } = await q;
    if (error) {
      await logMcpAction(ctx, auth.userId, "list_alerts", { hours, only_open }, "error", error.message);
      return textResult(`Erro ao listar alertas: ${error.message}`, true);
    }
    await logMcpAction(ctx, auth.userId, "list_alerts", { hours, only_open }, "ok");
    return jsonResult({ count: data?.length ?? 0, incidents: data ?? [] }, `${data?.length ?? 0} ocorrência(s).`);
  },
});
