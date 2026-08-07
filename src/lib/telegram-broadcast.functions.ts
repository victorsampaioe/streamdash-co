import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const broadcastTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { message: string }) => z.object({ message: z.string().min(1).max(3500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Apenas administradores");

    const { broadcastToTelegramSubscribers } = await import("./telegram-broadcast.server");
    const { runOnCore } = await import("./core-api.server");
    return await runOnCore("telegram-broadcast", { message: data.message }, () =>
      broadcastToTelegramSubscribers(data.message),
    );
  });
