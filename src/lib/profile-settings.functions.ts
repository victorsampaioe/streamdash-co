import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateTelegramStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    style: z.enum(["summary", "important", "individual"]),
    scope: z.enum(["iptv", "monitoring"]).default("iptv")
  }).parse(d))
  .handler(async ({ data, context }) => {
    const field = data.scope === "iptv" ? "telegram_iptv_style" : "telegram_alert_style";
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ [field]: data.style } as any)
      .eq("id", context.userId);

    if (error) throw error;
    return { ok: true };
  });
