import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Notifica no Telegram que uma nova arte de novidades está disponível. Somente admin. */
export const notifyArtReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string; serverName: string; total: number }) =>
    z.object({
      serverId: z.string().uuid(),
      serverName: z.string().min(1).max(120),
      total: z.number().int().min(0).max(100000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Apenas administradores");

    const { notifyNewArt } = await import("./art.server");
    return await notifyNewArt(data.serverId, data.serverName, data.total);
  });
