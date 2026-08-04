import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Reseller Manage Sub-Reseller Engine
 * Extends reseller-manage.functions.ts but specific for Sub-Resellers.
 */

export const getSubResellerDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Check if user is a member of the reseller's network and is a reseller
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, is_reseller, created_at, parent_id, credits")
      .eq("id", data.userId)
      .eq("parent_id", context.userId)
      .eq("is_reseller", true)
      .single();

    if (error || !profile) throw new Error("Revendedor não encontrado ou acesso negado.");

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("user_id", data.userId)
      .maybeSingle();

    // Also get their clients count
    const { count: clientsCount } = await context.supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", data.userId)
      .eq("is_reseller", false);

    return {
      ...profile,
      subscription: sub || null,
      clientsCount: clientsCount || 0
    };
  });

export const updateSubReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    userId: z.string().uuid(),
    fullName: z.string().min(3).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    status: z.enum(["active", "expired", "trial", "cancelled"]).optional(),
    creditsChange: z.number().optional() // Relative change
  }).parse(input))
  .handler(async ({ data, context }) => {
    // 1. Verify Ownership & Creator Status
    const { data: creator } = await context.supabase
      .from("profiles")
      .select("id, credits, is_reseller")
      .eq("id", context.userId)
      .single();

    if (!creator) throw new Error("Criador não encontrado.");

    const { data: targetReseller } = await context.supabase
      .from("profiles")
      .select("id, parent_id, credits, full_name")
      .eq("id", data.userId)
      .eq("parent_id", context.userId)
      .eq("is_reseller", true)
      .single();

    if (!targetReseller) throw new Error("Acesso negado: você só pode gerenciar revendedores criados por você.");

    // 2. Validate credits if adding
    if (data.creditsChange && data.creditsChange > 0) {
      if ((creator.credits || 0) < data.creditsChange) {
        throw new Error("Saldo insuficiente para transferir estes créditos.");
      }
    }

    // 3. Update Profile
    const profileUpdate: any = {};
    if (data.fullName) profileUpdate.full_name = data.fullName;
    if (data.email) profileUpdate.email = data.email;
    
    if (data.creditsChange !== undefined && data.creditsChange !== 0) {
      // We don't use RPC here to have better control over logs and errors in this specific context
      // but in production a transaction or RPC is safer.
      const newTargetCredits = (targetReseller.credits || 0) + data.creditsChange;
      if (newTargetCredits < 0) throw new Error("O saldo do revendedor não pode ficar negativo.");
      
      profileUpdate.credits = newTargetCredits;
      
      // Admin check
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });

      if (!isAdmin) {
        // Deduct from creator
        await supabaseAdmin.from("profiles")
          .update({ credits: (creator.credits || 0) - data.creditsChange } as any)
          .eq("id", context.userId);
      }

      // Log History for both
      await supabaseAdmin.from("reseller_credit_history").insert([
        {
          user_id: context.userId,
          amount: -data.creditsChange,
          type: data.creditsChange > 0 ? 'use' : 'purchase',
          description: `${data.creditsChange > 0 ? 'Transferência para' : 'Recolhimento de'} sub-revenda: ${targetReseller.full_name}`
        },
        {
          user_id: data.userId,
          amount: data.creditsChange,
          type: data.creditsChange > 0 ? 'purchase' : 'use',
          description: `${data.creditsChange > 0 ? 'Créditos recebidos do' : 'Créditos recolhidos pelo'} gestor`
        }
      ]);
    }

    if (Object.keys(profileUpdate).length > 0) {
      await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
    }

    // 4. Update Auth
    const authUpdate: any = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password) authUpdate.password = data.password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate);
      if (aErr) throw aErr;
    }

    // 5. Update Subscription
    if (data.status) {
      await supabaseAdmin.from("subscriptions")
        .update({ status: data.status as any })
        .eq("user_id", data.userId);
    }

    return { success: true };
  });

export const getSubResellerClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify Ownership
    const { data: isChild } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .eq("parent_id", context.userId)
      .single();

    if (!isChild) throw new Error("Acesso negado.");

    const { data: clients, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("parent_id", data.userId)
      .eq("is_reseller", false);

    if (error) throw new Error(error.message);
    return clients || [];
  });
