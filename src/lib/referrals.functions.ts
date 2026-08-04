import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSubResellerInternal } from "./referrals.server";

export const createSubReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        fullName: z.string().min(3),
        phone: z.string().min(8),
        isReseller: z.boolean().optional().default(true),
        initialCredits: z.number().min(10).optional().default(10),
        planId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isReseller, initialCredits, ...userData } = data;
    const result = await createSubResellerInternal(
      context.userId, 
      userData.email, 
      userData.fullName, 
      userData.phone, 
      isReseller,
      initialCredits
    );
    
    return result;
  });
