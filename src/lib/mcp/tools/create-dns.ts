import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "create_dns",
  title: "Cadastrar nova DNS",
  description:
    "Cadastra uma nova DNS (servidor) para monitoramento na conta do usuário. Ação sensível: cria um novo recurso na conta.",
  inputSchema: {
    name: z.string().min(2).max(80).describe("Nome amigável para a DNS."),
    host: z.string().min(3).max(255).describe("Host (domínio ou IP) a ser monitorado."),
    description: z.string().max(500).optional().describe("Descrição opcional."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ name, host, description }, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    const { data, error } = await auth.supabase
      .from("servers")
      .insert({ name, host, description: description ?? null, owner_id: auth.userId })
      .select()
      .single();
    if (error) {
      await logMcpAction(ctx, auth.userId, "create_dns", { name, host }, "error", error.message);
      return textResult(`Erro ao cadastrar DNS: ${error.message}`, true);
    }
    await logMcpAction(ctx, auth.userId, "create_dns", { name, host }, "ok");
    return jsonResult(data, `DNS "${name}" cadastrada com sucesso.`);
  },
});
