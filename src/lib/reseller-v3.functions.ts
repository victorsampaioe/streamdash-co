import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const createClientSchema = z.object({
  fullName: z.string().min(2),
  whatsapp: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
});

const createSubResellerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().min(8),
  initialCredits: z.number().min(10, "Mínimo 10 créditos"),
});

export const createTestClient = createServerFn({ method: "POST" })
  .inputValidator((data) => createClientSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!userId) throw new Error("Não autorizado");

    // Verify if creator is active
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", userId)
      .single();

    const isAdmin = profile?.role === "admin";
    if (!isAdmin && profile?.status !== "active") {
      throw new Error("Sua conta deve estar ativa para criar clientes.");
    }

    // Generate random email if not provided
    const email = data.email || `client_${Math.random().toString(36).substring(2, 9)}@streammonitor.site`;
    const password = `Stream@${Math.random().toString(36).substring(2, 6)}!`;

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName }
    });

    if (authError) throw new Error(`Erro ao criar acesso: ${authError.message}`);

    const newUserId = authData.user.id;

    // Set role and profile
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "user" as any });
    
    await supabaseAdmin.from("profiles").update({
      full_name: data.fullName,
      whatsapp: data.whatsapp,
      phone: data.whatsapp,
      parent_id: userId,
      plan: "trial" as any,
      status: "active" as any,
      trial_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 1 day trial
    } as any).eq("id", newUserId);

    // Record history
    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: userId,
      amount: 0,
      type: "client_creation",
      description: `Criou cliente teste ${data.fullName} - 1 dia`
    });

    return { success: true, email, password };
  });

export const createSubReseller = createServerFn({ method: "POST" })
  .inputValidator((data) => createSubResellerSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!userId) throw new Error("Não autorizado");

    // Verify creator credits and status
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role, credits")
      .eq("id", userId)
      .single();

    const isAdmin = profile?.role === "admin";
    if (!isAdmin && profile?.status !== "active") {
      throw new Error("Sua conta deve estar ativa para criar sub-revendas.");
    }

    if (!isAdmin && (profile?.credits || 0) < data.initialCredits) {
      throw new Error("Saldo de créditos insuficiente.");
    }

    // Create auth user
    const password = `Stream@${Math.random().toString(36).substring(2, 6)}!`;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName }
    });

    if (authError) throw new Error(`Erro ao criar acesso: ${authError.message}`);

    const newUserId = authData.user.id;

    // Set role and profile
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "sub_reseller" as any });
    
    await supabaseAdmin.from("profiles").update({
      full_name: data.fullName,
      whatsapp: data.whatsapp,
      phone: data.whatsapp,
      parent_id: userId,
      plan: "reseller" as any,
      status: "active" as any,
      credits: data.initialCredits
    } as any).eq("id", newUserId);

    // Deduct credits if not admin
    if (!isAdmin) {
      await supabaseAdmin.rpc("transfer_credits_v2", {
        p_from_id: userId,
        p_to_id: newUserId,
        p_amount: data.initialCredits
      });
    }

    // Record history
    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: userId,
      amount: data.initialCredits,
      type: "reseller_creation",
      description: `Criou sub-revendedor ${data.fullName} - ${data.initialCredits} créditos usados`
    });

    return { success: true, email: data.email, password };
  });
