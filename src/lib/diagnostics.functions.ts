import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

export const runDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { 
    serverId: string, 
    contentId: string, 
    contentType: 'live' | 'movie' | 'series' | 'episode' 
  }) => z.object({ 
    serverId: z.string().uuid(),
    contentId: z.string(),
    contentType: z.enum(['live', 'movie', 'series', 'episode'])
  }).parse(d))
  .handler(async ({ data, context }: any) => {
    const { runContentDiagnostic } = await import("./diagnostics.server");
    const { runOnCore } = await import("./core-api.server");

    // No context (client-side render without session yet)? 
    const userId = context?.userId || null;

    // Executa na VPS para medir latência real do datacentro
    try {
      const result = await runOnCore(
        "content-diagnostic",
        { ...data, userId },
        () => runContentDiagnostic(userId, data.serverId, data.contentId, data.contentType)
      );

      if (!result) {
        throw new Error("O motor de diagnóstico não retornou um resultado válido.");
      }

      return result;
    } catch (e: any) {
      console.error("[runDiagnostic] Fatal error:", e);
      const msg = e?.message || String(e);
      
      // Se o resultado do diagnóstico vier dentro de um erro (ex: falha do Core que retornou o objeto de erro)
      if (msg.includes('"steps":') && msg.includes('"status":')) {
        try {
          // Tenta extrair o JSON se ele estiver embutido na string de erro
          const jsonMatch = msg.match(/\{.*\}/s);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (parseErr) {
          console.error("[runDiagnostic] Failed to parse diagnostic result from error message", parseErr);
        }
      }

      // Se for um erro do Core, ele costuma vir com prefixo "Core content-diagnostic falhou (500): Error: ..."
      if (msg.includes("falhou (500): Error:")) {
        const cleanMsg = msg.split("Error:").pop()?.trim();
        if (cleanMsg) throw new Error(cleanMsg);
      }
      
      // Se for Unauthorized, passamos uma mensagem clara
      if (msg.includes("Unauthorized") || msg.includes("Unauthorized: Invalid token")) {
        throw new Error("Sessão expirada. Por favor, recarregue a página e faça login.");
      }
      
      throw e;
    }
  });


export const getCircuitBreakers = createServerFn({ method: "GET" })
  .handler(async ({ context }: any) => {
    if (!context?.supabase) {
      // Fallback para quando o middleware não está presente
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from('diagnostic_circuit_breakers' as any)
        .select('*, servers(name)');
      if (error) throw error;
      return data;
    }
    const { data, error } = await context.supabase
      .from('diagnostic_circuit_breakers' as any)
      .select('*, servers(name)');
    if (error) throw error;
    return data;
  });

/** Item 6 — Cancela um diagnóstico em andamento (fechamento do modal). */
export const cancelDiagnostic = createServerFn({ method: "POST" })
  .inputValidator((d: { serverId: string; contentId: string; contentType: string }) =>
    z.object({
      serverId: z.string().uuid(),
      contentId: z.string(),
      contentType: z.enum(['live', 'movie', 'series', 'episode']),
    }).parse(d))
  .handler(async ({ data }) => {
    const { requestDiagnosticCancel } = await import("./diagnostics.server");
    const { runOnCore } = await import("./core-api.server");
    return await runOnCore(
      "content-diagnostic-cancel",
      data,
      () => requestDiagnosticCancel(data.serverId, data.contentId, data.contentType),
    );
  });
