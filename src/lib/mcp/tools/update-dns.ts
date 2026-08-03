import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "update_dns",
  title: "Editar DNS existente",
  description:
    "Atualiza os dados de uma DNS existente (nome, host, descrição). Ação sensível: modifica dados da conta.",
  inputSchema: {
    id: z.string().uuid().describe("ID (UUID) da DNS a atualizar."),
    name: z.string().min(2).max(80).optional(),
    host: z.string().min(3).max(255).optional(),
    description: z.string().max(500).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ id, ...patch }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(cleaned).length === 0) return textResult("Nada para atualizar.", true);
    const { data, error } = await (auth.supabase.from("servers") as any)
      .update(cleaned)
      .eq("id", id)
      .select("id, name, description, category, current_status")
      .maybeSingle();

    if (error) {
      await logMcpAction(ctx, auth.userId, "update_dns", { id, patch: cleaned }, "error", error.message);
      return textResult(`Erro ao atualizar DNS: ${error.message}`, true);
    }
    if (!data) return textResult("DNS não encontrada ou sem permissão.", true);
    await logMcpAction(ctx, auth.userId, "update_dns", { id, patch: cleaned }, "ok");
    return jsonResult(data, "DNS atualizada.");
  },
});
