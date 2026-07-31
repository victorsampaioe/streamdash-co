import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runDnsCheckNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado ou sem permissão");

    const { runDnsCheck } = await import("./dns.server");
    return await runDnsCheck(data.serverId);
  });

export const acknowledgeDnsAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { alertId: string }) => z.object({ alertId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dns_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", data.alertId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
