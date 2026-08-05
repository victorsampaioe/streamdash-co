import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const convertToReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string(),
      fullName: z.string().min(3),
      email: z.string().email(),
      initialCredits: z.number().min(0),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // Admin check
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized");

    // 1. Convert account type and set credits
    const { error } = await supabaseAdmin.from("profiles").update({
      is_reseller: true,
      credits: data.initialCredits,
      full_name: data.fullName,
      email: data.email
    }).eq("id", data.userId);

    if (error) throw error;

    // 2. Adjust Subscription for Reseller (Resellers don't depend on client-plan expiry, 
    // but we set it to a far future 'active' state for UI consistency while following reseller rules).
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);

    await supabaseAdmin.from("subscriptions").upsert({
      user_id: data.userId,
      plan: "reseller" as any,
      status: "active",
      expires_at: farFuture.toISOString()
    } as any);

    return { success: true };
  });
