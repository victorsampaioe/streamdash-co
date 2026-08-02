import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const evaluateMyAchievements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("evaluate_achievements", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    const granted = (data as number) ?? 0;
    if (granted > 0) {
      const { notifyAchievements } = await import("./achievements.server");
      await notifyAchievements(context.userId, granted);
    }
    return { granted };
  });
