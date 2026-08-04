import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function createSubResellerInternal(
  creatorId: string,
  email: string,
  fullName: string,
  phone: string,
  isReseller: boolean = true,
  initialCredits: number = 10
) {
  // 1. Verify creator has credits and active subscription
  const { data: creatorProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, referral_code, credits, is_reseller")
    .eq("id", creatorId)
    .single();

  if (profileError || !creatorProfile) {
    throw new Error("Erro ao obter seu perfil. Verifique sua conta.");
  }

  // A reseller must have at least 10 credits to create another reseller
  // But we allow admins to create resellers with any amount of credits (it will be deducted from their balance)
  const minCreditsRequired = isReseller ? initialCredits : 0;
  
  if (!isAdmin && isReseller && (creatorProfile.credits || 0) < minCreditsRequired) {
    throw new Error(`Saldo insuficiente. Você precisa de no mínimo ${minCreditsRequired} créditos.`);
  }

  // Verify creator has an active subscription or is admin
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: creatorId,
    _role: "admin",
  });

  if (!isAdmin) {
    const { data: creatorActive } = await supabaseAdmin.rpc("subscription_is_active", { _user_id: creatorId });
    if (!creatorActive) {
      // Check if creator is a reseller (resellers might not need an active "official" subscription if they have credits)
      if (!creatorProfile.is_reseller) {
        throw new Error("Sua conta precisa estar ativa para criar revendedores ou clientes.");
      }
    }
  }

  if (!creatorProfile.referral_code) {
    throw new Error("Seu código de indicação não foi encontrado. Contate o suporte.");
  }

  // 2. Pre-check for existing phone (Auth API doesn't always provide clear unique constraint errors)
  const { data: existingPhone } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  
  if (existingPhone) {
    throw new Error("Este número de telefone já está sendo utilizado.");
  }

  // 3. Create the new user in Auth
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
      throw new Error("Este e-mail já está cadastrado no sistema.");
    }
    if (authError.message.includes("phone")) {
      throw new Error("Este número de telefone já está em uso.");
    }
    console.error("[createSubReseller] authError:", authError);
    throw new Error(`Não foi possível criar o acesso: ${authError.message}`);
  }

  const userId = newUser.user.id;

  // 4. Setup profile - Use a retry loop to ensure the trigger has finished creating the profile
  let profileSet = false;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        trial_used: true,
        signup_bonus_days: 1, 
        parent_id: creatorId,
        is_reseller: isReseller,
        credits: isReseller ? initialCredits : 0
      } as any)
      .eq("id", userId)
      .select();

    if (!error && data && data.length > 0) {
      profileSet = true;
      break;
    }
    // Wait 200ms before retry
    await new Promise(r => setTimeout(r, 200));
  }

  if (!profileSet) {
    console.error("[createSubReseller] Failed to update profile after creation for user:", userId);
    // Fallback: manually insert if trigger failed (unlikely but safe)
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      phone,
      referral_code: `TEMP-${Math.random().toString(36).slice(-6)}`,
      referred_by: creatorId,
      trial_used: true,
      signup_bonus_days: 1,
      parent_id: creatorId,
      is_reseller: isReseller,
      credits: isReseller ? initialCredits : 0
    } as any);
  }

  // Deduct credits from creator if creating a reseller
  if (isReseller) {
    const { error: deductError } = await supabaseAdmin
      .from("profiles")
      .update({
        credits: (creatorProfile.credits || 0) - initialCredits
      } as any)
      .eq("id", creatorId);
    
    if (deductError) {
      console.error("[createSubReseller] Failed to deduct credits:", deductError);
    }
 
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
          type: 'purchase',
          description: `Créditos iniciais recebidos de ${creatorProfile.referral_code}`
        }
      ]);
  }

  // 5. Create the subscription (1 day trial)
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 1);

  await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      plan: "trial" as any,
      status: "trial" as any,
      expires_at: trialExpiresAt.toISOString()
    });

  return { 
    id: userId, 
    email, 
    password: tempPassword 
  };
}
