import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const updateTelegramStyle = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    style: z.enum(["summary", "important", "individual"])
  }).parse(d))
  .handler(async ({ data, request }) => {
    const { attachSupabaseAuth } = await import("@/integrations/supabase/auth-attacher.server");
    const { user, error: authError } = await attachSupabaseAuth(request);
    if (authError || !user) throw new Error("Unauthorized");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_iptv_style: data.style } as any)
      .eq("id", user.id);

    if (error) throw error;
    return { ok: true };
  });
