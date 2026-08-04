import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createResellerAccount } from "./reseller-v2.server";

export const createResellerV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email("E-mail inválido"),
        fullName: z.string().min(3, "Nome muito curto"),
        initialCredits: z.number().min(10, "Mínimo 10 créditos"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return await createResellerAccount(
      context.userId,
      data.email,
      data.fullName,
      data.initialCredits
    );
  });
