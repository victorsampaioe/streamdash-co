import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Modern Reseller Creation Engine
 * Completely clean of referral logic, trial codes, or manual approvals.
 */
export async function createResellerAccount(
  creatorId: string,
  email: string,
  fullName: string,
  initialCredits: number = 10
) {
  // 1. Validation
  if (initialCredits < 10) {
    throw new Error("Mínimo obrigatório: 10 créditos para criar uma sub-revenda.");
  }

  // 2. Check Creator
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from("profiles")
    .select("id, credits, is_reseller")
    .eq("id", creatorId)
    .single();

  if (creatorErr || !creator) {
    throw new Error("Erro ao validar conta do criador.");
  }

  // Admin check
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: creatorId,
    _role: "admin",
  });

  // Verify credits if not admin
  if (!isAdmin && (creator.credits || 0) < initialCredits) {
    throw new Error(`Saldo insuficiente. Você tem ${creator.credits || 0} créditos, mas precisa de ${initialCredits}.`);
  }

  // 3. Create Auth User
  const tempPassword = Math.random().toString(36).slice(-12) + "!";
  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      is_reseller: true
    }
  });

  if (authErr) {
    if (authErr.message.includes("already exists")) {
      throw new Error("Este e-mail já está cadastrado.");
    }
    throw new Error(`Erro ao criar acesso: ${authErr.message}`);
  }

  const newUserId = authUser.user.id;

  // 4. Update/Upsert Profile (Force clean slate)
  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: newUserId,
      email,
      full_name: fullName,
      is_reseller: true,
      credits: initialCredits,
      parent_id: creatorId,
      trial_used: true // Mark trial as used to prevent any lingering trial logic
    } as any);

  if (profileErr) {
    // Cleanup auth user if profile fails
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    throw new Error(`Erro ao configurar perfil: ${profileErr.message}`);
  }

  // 5. Activate Subscription Immediately (1 year)
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);

  await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: newUserId,
      plan: "reseller" as any,
      status: "active" as any,
      expires_at: expiry.toISOString()
    });

  // 6. Deduct credits from creator (if not admin) and Log History
  if (!isAdmin) {
    await supabaseAdmin
      .from("profiles")
      .update({ credits: (creator.credits || 0) - initialCredits } as any)
      .eq("id", creatorId);
  }

  // History for Creator
  await supabaseAdmin.from("reseller_credit_history").insert({
    user_id: creatorId,
    amount: -initialCredits,
    type: 'use',
    description: `Criação de sub-revenda: ${email}`
  });

  // History for New User
  await supabaseAdmin.from("reseller_credit_history").insert({
    user_id: newUserId,
    amount: initialCredits,
    type: 'purchase',
    description: `Saldo inicial recebido do criador`
  });

  return {
    id: newUserId,
    email,
    password: tempPassword
  };
}
