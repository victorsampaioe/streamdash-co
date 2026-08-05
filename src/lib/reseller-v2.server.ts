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
  
  // 1.1. Admin check (moved up for validation)
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: creatorId,
    _role: "admin",
  });

  // 1.2. Check Creator
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from("profiles")
    .select("id, credits, is_reseller")
    .eq("id", creatorId)
    .single();

  if (creatorErr || !creator) {
    throw new Error("Erro ao validar conta do criador.");
  }

  // 1.3. Bloqueio se o criador estiver com saldo zero (e não for admin)
  if (!isAdmin && (creator.credits || 0) <= 0) {
    throw new Error("Seu saldo de créditos acabou. Recarregue para criar novos clientes ou revendedores.");
  }

  if (isReseller && initialCredits < 10 && !isAdmin) {
    throw new Error("Mínimo obrigatório: 10 créditos para criar uma sub-revenda.");
  }


  // Verify credits if not admin
  if (!isAdmin && (creator.credits || 0) < creditsToDeduct) {
    throw new Error("Você não possui créditos suficientes para criar este cliente. Adicione créditos para continuar.");
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

  // 4. Update/Upsert Profile (Force clean slate)
  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: newUserId,
      email,
      full_name: fullName,
      is_reseller: isReseller,
      credits: initialCredits,
      parent_id: creatorId,
      trial_used: true
    } as any);

  if (profileErr) {
    // Cleanup auth user if profile fails
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    throw new Error(`Erro ao configurar perfil: ${profileErr.message}`);
  }

  // 5. Activate Subscription Immediately
  const expiry = new Date();
  if (isReseller) {
    expiry.setFullYear(expiry.getFullYear() + 1);
  } else {
    expiry.setMonth(expiry.getMonth() + months);
  }

  await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: newUserId,
      plan: isReseller ? ("reseller" as any) : ("basic" as any),
      status: "active" as any,
      expires_at: expiry.toISOString()
    });

  // 6. Deduct credits from creator (if not admin and credits used) and Log History
  if (!isAdmin && creditsToDeduct > 0) {
    await supabaseAdmin
      .from("profiles")
      .update({ credits: (creator.credits || 0) - creditsToDeduct } as any)
      .eq("id", creatorId);
  }

  if (creditsToDeduct > 0) {
    // History for Creator
    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: creatorId,
      amount: -creditsToDeduct,
      type: 'use',
      description: `Criação de ${isReseller ? 'sub-revenda' : 'cliente'}: ${email} (${isReseller ? initialCredits + ' créditos' : months + ' mês/meses'})`
    });

    // History for New User (only if it's a reseller receiving credits)
    if (isReseller) {
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
