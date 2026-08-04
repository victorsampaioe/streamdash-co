import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const updateReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      fullName: z.string().optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      status: z.enum(["active", "expired", "trial", "cancelled"]).optional(),
      creditsChange: z.number().optional(), // Positive to add, negative to remove
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // 1. Admin check
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado: apenas administradores podem realizar esta ação.");

    // 2. Fetch current profile
    const { data: profile, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("credits, full_name, email")
      .eq("id", data.userId)
      .single();

    if (fetchErr || !profile) throw new Error("Resendedor não encontrado.");

    // 3. Update Profile (Name, Email, Credits)
    const profileUpdate: any = {};
    if (data.fullName) profileUpdate.full_name = data.fullName;
    if (data.email) profileUpdate.email = data.email;
    
    if (data.creditsChange !== undefined && data.creditsChange !== 0) {
      // If adding credits, verify target is not admin (admins don't need credits, but we can set them for display)
      // The requirement says admin has infinite, but for consistency we let admin set credits to resellers.
      profileUpdate.credits = (profile.credits || 0) + data.creditsChange;
      if (profileUpdate.credits < 0) profileUpdate.credits = 0;
    }

    if (Object.keys(profileUpdate).length > 0) {
      const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
      if (pErr) throw pErr;
    }

    // 4. Update Auth (Email, Password)
    const authUpdate: any = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password) authUpdate.password = data.password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate);
      if (aErr) throw aErr;
    }

    // 5. Update Subscription (Status)
    if (data.status) {
      const { error: sErr } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: data.status as any })
        .eq("user_id", data.userId);
      if (sErr) throw sErr;
    }

    // 6. Log Credit History if changed
    if (data.creditsChange !== undefined && data.creditsChange !== 0) {
      const { data: adminProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .single();

      await supabaseAdmin.from("reseller_credit_history").insert({
        user_id: data.userId,
        amount: data.creditsChange,
        type: data.creditsChange > 0 ? 'purchase' : 'use',
        description: `Ajuste manual pelo administrador (${adminProfile?.full_name || 'Admin'})`
      });
    }

    return { success: true };
  });
