import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "list_dns",
  title: "Listar DNS monitoradas",
  description:
    "Lista todas as DNS (servidores) monitoradas pelo usuário, com status atual, latência e informações de SSL. Suporta filtro opcional por status ('up', 'down', 'degraded').",
  inputSchema: {
    status: z
      .enum(["up", "down", "degraded", "unknown"]) 
      .optional()
      .describe("Filtrar apenas DNS com este status atual."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    let q = auth.supabase
      .from("servers")
      .select("id, name, host, description, current_status, last_latency_ms, ssl_days_remaining, last_checked_at, consecutive_failures")
      .order("name");
    if (status) q = q.eq("current_status", status);
    const { data, error } = await q;
    if (error) {
      await logMcpAction(ctx, auth.userId, "list_dns", { status }, "error", error.message);
      return textResult(`Erro ao listar DNS: ${error.message}`, true);
    }
    await logMcpAction(ctx, auth.userId, "list_dns", { status }, "ok");
    return jsonResult({ count: data?.length ?? 0, servers: data ?? [] }, `${data?.length ?? 0} DNS encontrada(s).`);
  },
});
