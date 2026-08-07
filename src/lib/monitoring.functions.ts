import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { runCheckForServer, runDueChecks } from "./monitoring.server";

// Authenticated: user forces a check on their own server (RLS-protected)
export const runCheckNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify ownership OR admin via RLS-scoped client
    const { data: srv, error } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (error || !srv) throw new Error("Servidor não encontrado ou sem permissão");
    const { runOnCore } = await import("./core-api.server");
    return await runOnCore("check", { serverId: data.serverId }, () => runCheckForServer(data.serverId));
  });

// Public cron entry — protected by CRON_SECRET
export const cronRunChecks = createServerFn({ method: "POST" })
  .inputValidator((d: { secret: string }) => z.object({ secret: z.string() }).parse(d))
  .handler(async ({ data }) => {
    if (data.secret !== process.env.CRON_SECRET) throw new Error("Forbidden");
    const { runOnCore } = await import("./core-api.server");
    return await runOnCore("cron-check", {}, () => runDueChecks());
  });
