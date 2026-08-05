import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Modern Reseller Creation Engine v2
 * Completely clean of referral logic, trial codes, or manual approvals.
 */
export async function createResellerAccount(
  creatorId: string,
  email: string,
  fullName: string,
  initialCredits: number = 0,
  months: number = 1,
  isReseller: boolean = false
) {
  // 1. Validation
  const creditsToDeduct = isReseller ? initialCredits : months;
  
  // 1.1. Admin check
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: creatorId,
    _role: "admin",
  });

  // 1.2. Check Creator Wallet
  const { data: wallet, error: walletErr } = await supabaseAdmin
    .from("reseller_wallet")
    .select("credits")
    .eq("reseller_id", creatorId)
    .maybeSingle();

  if (walletErr) throw new Error("Erro ao validar saldo do criador.");

  const currentCredits = wallet?.credits || 0;

  // 1.3. Bloqueio se o criador estiver com saldo insuficiente (e não for admin)
  if (!isAdmin) {
    if (currentCredits <= 0) {
      throw new Error("Seu saldo de créditos acabou. Recarregue para criar novos clientes ou revendedores.");
    }
    if (currentCredits < creditsToDeduct) {
      throw new Error(`Você não possui créditos suficientes (${currentCredits}) para deduzir ${creditsToDeduct}.`);
    }
    if (isReseller && initialCredits < 10) {
      throw new Error("Mínimo obrigatório: 10 créditos para criar uma sub-revenda.");
    }
  }

  // 3. Create Auth User
  const tempPassword = Math.random().toString(36).slice(-12) + "!";
  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      is_reseller: isReseller
    }
  });

  if (authErr) {
    if (authErr.message.includes("already exists") || authErr.code === "email_exists") {
      throw new Error("Este e-mail já está cadastrado.");
    }
    throw new Error(`Falha no Auth: ${authErr.message}`);
  }

  const newUserId = authUser.user.id;

  // 4. Update Profile
  await supabaseAdmin
    .from("profiles")
    .upsert({
      id: newUserId,
      email,
      full_name: fullName,
      is_reseller: isReseller,
      parent_id: creatorId,
      trial_used: true
    });

  // 5. Update Hierarchy Tree
  const { data: creatorTree } = await supabaseAdmin
    .from("reseller_tree")
    .select("owner_id")
    .eq("user_id", creatorId)
    .maybeSingle();

  await supabaseAdmin
    .from("reseller_tree")
    .upsert({
      user_id: newUserId,
      parent_reseller_id: creatorId,
      owner_id: creatorTree?.owner_id || creatorId
    });

  // 6. Initialize Wallet for new user
  await supabaseAdmin
    .from("reseller_wallet")
    .upsert({ reseller_id: newUserId, credits: isReseller ? initialCredits : 0 });

  // 7. Activate Subscription
  const expiry = new Date();
  if (isReseller) {
    expiry.setFullYear(expiry.getFullYear() + 10);
  } else {
    expiry.setMonth(expiry.getMonth() + months);
  }

  await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: newUserId,
      plan: isReseller ? "reseller" : "basic",
      status: "active",
      expires_at: expiry.toISOString()
    });

  // 8. Deduct credits from creator and Log History
  if (!isAdmin && creditsToDeduct > 0) {
    await supabaseAdmin
      .from("reseller_wallet")
      .update({ credits: currentCredits - creditsToDeduct })
      .eq("reseller_id", creatorId);
  }

  if (creditsToDeduct > 0) {
    // History for Creator
    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: creatorId,
      amount: -creditsToDeduct,
      type: 'use',
      description: `Criação de ${isReseller ? 'sub-revenda' : 'cliente'}: ${email} (${isReseller ? initialCredits + ' créditos' : months + ' mês/meses'})`
    });

    // History for New User (if reseller)
    if (isReseller && initialCredits > 0) {
      await supabaseAdmin.from("reseller_credit_history").insert({
        user_id: newUserId,
        amount: initialCredits,
        type: 'purchase',
        description: `Saldo inicial recebido do criador`
      });
    }
  }

  return {
    id: newUserId,
    email,
    password: tempPassword
  };
}
