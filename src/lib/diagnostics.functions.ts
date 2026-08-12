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

    const userId = context?.userId || null;

    // Executa na VPS para medir latência real do datacentro
    return await runOnCore(
      "content-diagnostic",
      data,
      () => runContentDiagnostic(userId, data.serverId, data.contentId, data.contentType)
    );
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
