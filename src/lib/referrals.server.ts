import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function createSubResellerInternal(
  creatorId: string,
  email: string,
  fullName: string,
  phone: string,
  isReseller: boolean = true,
  initialCredits: number = 10
) {
  // 1. Verify creator has an active subscription and credits
  const { data: creatorProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, referral_code, credits")
    .eq("id", creatorId)
    .single();

  if (profileError || !creatorProfile) {
    throw new Error("Erro ao obter seu perfil.");
  }

  if (isReseller && (creatorProfile.credits || 0) < initialCredits) {
    throw new Error(`Você não possui créditos suficientes (${initialCredits}) para criar uma nova revenda com este valor inicial. Adquira mais créditos para continuar.`);
  }

  // 1b. Verify creator has an active subscription
  const { data: creatorActive, error: activityError } = await supabaseAdmin.rpc("subscription_is_active", { _user_id: creatorId });
  
  if (activityError) {
    console.error("Error checking activity:", activityError);
  }

  if (!creatorActive) {
    throw new Error("Você precisa ter uma assinatura ativa para criar sub-revendedores.");
  }

  if (!creatorProfile.referral_code) {
    throw new Error("Erro ao obter seu código de indicação.");
  }

  // 3. Create the new user in Auth
  // We'll generate a random temporary password
  const tempPassword = Math.random().toString(36).slice(-12) + "!";
  
  const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone,
      referral_code: creatorProfile.referral_code,
      is_reseller: isReseller
    }
  });

  if (authError) {
    if (authError.message.includes("already exists")) {
      throw new Error("Este e-mail já está cadastrado.");
    }
    throw new Error(`Erro ao criar usuário: ${authError.message}`);
  }

  const userId = newUser.user.id;

  // 4. Mark trial as used, set parent_id, credits and role
  await supabaseAdmin
    .from("profiles")
    .update({
      trial_used: true,
      signup_bonus_days: 1,
      parent_id: creatorId,
      is_reseller: isReseller,
      credits: isReseller ? initialCredits : 0
    } as any)
    .eq("id", userId);

  // Deduct credits from creator if creating a reseller
  if (isReseller) {
    await supabaseAdmin
      .from("profiles")
      .update({
        credits: (creatorProfile.credits || 0) - initialCredits
      } as any)
      .eq("id", creatorId);
 
    // Log credit use
    await supabaseAdmin
      .from("credit_history")
      .insert([
        {
          user_id: creatorId,
          amount: -initialCredits,
          type: 'use',
          description: `Criação do revendedor ${email} com ${initialCredits} créditos iniciais`
        },
        {
          user_id: userId,
          amount: initialCredits,
          type: 'purchase', // or maybe 'transfer' type if we had it, using purchase for now to show as income
          description: `Créditos iniciais recebidos de ${creatorProfile.referral_code}`
        }
      ]);
  }

  // 5. Create the subscription for the new user (1 day trial)
  // If isReseller is true, it's a sub-reseller account.
  // If isReseller is false, it's a client account.
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 1);

  const { error: createSubError } = await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      plan: "trial" as any,
      status: "trial" as any,
      expires_at: trialExpiresAt.toISOString()
    });

  if (createSubError) {
    console.error("Error creating subscription:", createSubError);
  }

  // 6. Update referral status to trial_active
  await supabaseAdmin
    .from("referrals")
    .update({ status: "trial_active" } as any)
    .eq("referred_id", userId);

  return { 
    id: userId, 
    email, 
    password: tempPassword 
  };
}
