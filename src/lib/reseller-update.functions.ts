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

    if (Object.keys(profileUpdate).length > 0) {
      const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
      if (pErr) throw pErr;
    }

    // 3b. Credits live in reseller_wallet (source of truth; a trigger mirrors it into profiles.credits)
    let newBalance: number | null = null;
    if (data.creditsChange !== undefined && data.creditsChange !== 0) {
      const { data: wallet } = await supabaseAdmin
        .from("reseller_wallet")
        .select("credits")
        .eq("reseller_id", data.userId)
        .maybeSingle();

      const current = wallet?.credits ?? profile.credits ?? 0;
      newBalance = Math.max(0, current + data.creditsChange);

      const { error: wErr } = await supabaseAdmin
        .from("reseller_wallet")
        .upsert({ reseller_id: data.userId, credits: newBalance, updated_at: new Date().toISOString() }, { onConflict: "reseller_id" });
      if (wErr) throw wErr;

      // Keep profiles in sync even if the trigger is absent
      const { error: pcErr } = await supabaseAdmin
        .from("profiles")
        .update({ credits: newBalance })
        .eq("id", data.userId);
      if (pcErr) throw pcErr;
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

    return { success: true, credits: newBalance };
  });
