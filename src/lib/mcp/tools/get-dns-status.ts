import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "get_dns_status",
  title: "Ver status detalhado de uma DNS",
  description:
    "Retorna o status detalhado de uma DNS específica: status atual, latência, últimas verificações e incidentes abertos. Identifique a DNS por ID (UUID) ou pelo nome exato.",
  inputSchema: {
    id: z.string().uuid().optional().describe("ID (UUID) da DNS."),
    name: z.string().optional().describe("Nome exato da DNS (usado quando 'id' não é fornecido)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, name }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    if (!id && !name) return textResult("Informe 'id' ou 'name' da DNS.", true);
    // Nunca expor host/credenciais IPTV a clientes MCP externos.
    const base = auth.supabase
      .from("servers")
      .select(
        "id, name, description, category, current_status, last_checked_at, last_latency_ms, consecutive_failures, ssl_days_remaining, health_score, dns_health_score, is_public, created_at",
      );

    const { data: server, error } = await (id ? base.eq("id", id) : base.eq("name", name!)).maybeSingle();
    if (error || !server) return textResult("DNS não encontrada ou sem permissão.", true);
    const [{ data: checks }, { data: incidents }] = await Promise.all([
      auth.supabase.from("checks").select("status, latency_ms, http_status, error, created_at").eq("server_id", server.id).order("created_at", { ascending: false }).limit(10),
      auth.supabase.from("incidents").select("id, reason, started_at, ended_at").eq("server_id", server.id).is("ended_at", null),
    ]);
    await logMcpAction(ctx, auth.userId, "get_dns_status", { id, name }, "ok");
    return jsonResult({ server, recent_checks: checks ?? [], open_incidents: incidents ?? [] }, `Status de ${server.name}: ${server.current_status}`);
  },
});
