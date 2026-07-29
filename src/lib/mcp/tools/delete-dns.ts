import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "delete_dns",
  title: "Excluir DNS",
  description:
    "Exclui permanentemente uma DNS monitorada da conta do usuário. AÇÃO IRREVERSÍVEL: peça confirmação explícita ao usuário antes de executar.",
  inputSchema: {
    id: z.string().uuid().describe("ID (UUID) da DNS a excluir."),
    confirm: z.literal(true).describe("Precisa ser 'true' para confirmar a exclusão irreversível."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ id, confirm }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    if (confirm !== true) return textResult("Exclusão não confirmada.", true);
    const { data, error } = await auth.supabase.from("servers").delete().eq("id", id).select("id, name").maybeSingle();
    if (error) {
      await logMcpAction(ctx, auth.userId, "delete_dns", { id }, "error", error.message);
      return textResult(`Erro ao excluir DNS: ${error.message}`, true);
    }
    if (!data) return textResult("DNS não encontrada ou sem permissão.", true);
    await logMcpAction(ctx, auth.userId, "delete_dns", { id }, "ok");
    return jsonResult(data, `DNS "${data.name}" excluída.`);
  },
});
