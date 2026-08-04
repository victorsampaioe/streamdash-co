import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const updateClientAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string(),
      fullName: z.string().optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // Admin check
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized");

    // Update Profile
    const updateData: any = {};
    if (data.fullName) updateData.full_name = data.fullName;
    if (data.email) updateData.email = data.email;

    if (Object.keys(updateData).length > 0) {
      const { error: pErr } = await supabaseAdmin.from("profiles").update(updateData).eq("id", data.userId);
      if (pErr) throw pErr;
    }

    // Update Auth
    const authUpdate: any = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password) authUpdate.password = data.password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate);
      if (aErr) throw aErr;
    }

    return { success: true };
  });
