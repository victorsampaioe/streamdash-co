import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Testa um chat_id do Telegram enviando uma mensagem de confirmação. */
export const testTelegramChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target: string }) => z.object({ target: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { verifyTelegramChat } = await import("./telegram-verify.server");
    return await verifyTelegramChat(data.target);
  });
