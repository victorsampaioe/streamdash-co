import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const detectIptvNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id, host, iptv_username, iptv_password")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { detectIptvKind } = await import("./iptv.server");
    const res = await detectIptvKind(srv.host, srv.iptv_username, srv.iptv_password);

    const { error } = await context.supabase
      .from("servers")
      .update({ iptv_detected: res.kind })
      .eq("id", srv.id);
    if (error) throw new Error(error.message);

    return { kind: res.kind };
  });

export const runIptvSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string; mode?: "smart" | "full" }) =>
    z.object({ serverId: z.string().uuid(), mode: z.enum(["smart", "full"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { runIptvSync } = await import("./iptv.server");
    const result = await runIptvSync(data.serverId, { mode: data.mode ?? "smart", force: true });
    return result;
  });

export const acknowledgeIptvAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { alertId: string }) => z.object({ alertId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("iptv_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", data.alertId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
