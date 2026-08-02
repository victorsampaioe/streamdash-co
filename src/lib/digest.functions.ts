import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Envia agora, para o próprio usuário, uma prévia do resumo inteligente no Telegram. */
export const sendMyDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendDigestToUser } = await import("./digest.server");
    return await sendDigestToUser(context.userId, "daily", true);
  });
