import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAsUser, textResult, jsonResult, logMcpAction } from "../context";
import { PLANS } from "@/lib/payments";

// Note: does NOT require active subscription — user can consult status even if expired.
export default defineTool({
  name: "get_subscription",
  title: "Consultar assinatura e planos",
  description:
    "Retorna o plano atual do usuário, status, dias restantes e a lista de planos disponíveis (mensal/anual) para renovação.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args: z.infer<z.ZodObject<Record<string, never>>>, ctx) => {
    if (!ctx.isAuthenticated()) return textResult("Não autenticado.", true);
    const userId = ctx.getUserId();
    if (!userId) return textResult("Token inválido.", true);
    const supabase = supabaseAsUser(ctx);
    const { data: sub, error } = await supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
    if (error) return textResult(`Erro: ${error.message}`, true);
    const now = Date.now();
    const expiresAt = sub?.expires_at ? new Date(sub.expires_at).getTime() : 0;
    const daysRemaining = sub ? Math.max(0, Math.ceil((expiresAt - now) / 86_400_000)) : 0;
    const isActive = !!sub && (sub.status === "active" || sub.status === "trial") && expiresAt > now;
    await logMcpAction(ctx, userId, "get_subscription", {}, "ok");
    return jsonResult(
      {
        subscription: sub,
        is_active: isActive,
        days_remaining: daysRemaining,
        available_plans: PLANS,
        renewal_url: "https://streammonitor.site/app/subscription",
      },
      isActive ? `Assinatura ativa: ${daysRemaining} dia(s) restantes.` : "Assinatura inativa ou expirada.",
    );
  },
});
