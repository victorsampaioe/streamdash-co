import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const evaluateMyAchievements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("evaluate_achievements", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    return { granted: data as number };
  });
