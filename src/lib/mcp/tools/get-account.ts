import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireActiveSubscriber, textResult, jsonResult, logMcpAction } from "../context";

export default defineTool({
  name: "get_account_info",
  title: "Consultar informações da conta",
  description:
    "Retorna informações da conta do usuário autenticado no Stream Monitor (e-mail, telefone, código de indicação, saldo de bônus).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args: z.infer<z.ZodObject<Record<string, never>>>, ctx) => {
    const auth = await requireActiveSubscriber(ctx);
    if (!auth.ok) return textResult(auth.error, true);
    const { supabase, userId } = auth;
    const [{ data: profile }, { data: userInfo }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const account = {
      user_id: userId,
      email: userInfo.user?.email ?? null,
      profile,
    };
    await logMcpAction(ctx, userId, "get_account_info", {}, "ok");
    return jsonResult(account, "Informações da conta:");
  },
});
