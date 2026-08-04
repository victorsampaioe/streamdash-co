import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Reseller Manage Client Engine
 * Allows resellers to manage their own network only.
 */

export const getClientDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Check if user is a member of the reseller's network
    const { data: client, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, is_reseller, created_at, parent_id")
      .eq("id", data.userId)
      .eq("parent_id", context.userId)
      .single();

    if (error || !client) throw new Error("Cliente não encontrado ou acesso negado.");

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("user_id", data.userId)
      .maybeSingle();

    return {
      ...client,
      subscription: sub || null
    };
  });

export const updateResellerClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    userId: z.string().uuid(),
    fullName: z.string().min(3).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    plan: z.enum(["trial", "monthly", "yearly", "reseller", "basic"]).optional(),
    status: z.enum(["active", "expired", "trial", "cancelled"]).optional()
  }).parse(input))
  .handler(async ({ data, context }) => {
    // 1. Verify Ownership
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, parent_id")
      .eq("id", data.userId)
      .eq("parent_id", context.userId)
      .single();

    if (!profile) throw new Error("Acesso negado.");

    // 2. Update Profile
    const profileUpdate: any = {};
    if (data.fullName) profileUpdate.full_name = data.fullName;
    if (data.email) profileUpdate.email = data.email;

    if (Object.keys(profileUpdate).length > 0) {
      await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
    }

    // 3. Update Auth
    const authUpdate: any = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password) authUpdate.password = data.password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate);
      if (aErr) throw aErr;
    }

    // 4. Update Subscription
    const subUpdate: any = {};
    if (data.plan) subUpdate.plan = data.plan;
    if (data.status) subUpdate.status = data.status;

    if (Object.keys(subUpdate).length > 0) {
      await supabaseAdmin.from("subscriptions").update(subUpdate).eq("user_id", data.userId);
    }

    return { success: true };
  });

export const deleteResellerClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify Ownership
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, parent_id")
      .eq("id", data.userId)
      .eq("parent_id", context.userId)
      .single();

    if (!profile) throw new Error("Acesso negado.");

    // Delete Auth User (Cascades in standard setups, but we do it manually to be safe)
    const { error: aErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (aErr) throw aErr;

    return { success: true };
  });
