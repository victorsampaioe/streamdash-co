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

    // Convert
    const { error } = await supabaseAdmin.from("profiles").update({
      is_reseller: true,
      credits: data.initialCredits,
      full_name: data.fullName,
      email: data.email
    }).eq("id", data.userId);

    if (error) throw error;

    // Update Subscription
    await supabaseAdmin.from("subscriptions").upsert({
      user_id: data.userId,
      plan: "monthly", // Use monthly as a proxy for active paid plan if 'reseller' isn't in enum
      status: "active"
    } as any);

    return { success: true };
  });
