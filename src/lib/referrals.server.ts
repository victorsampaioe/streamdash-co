import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function createSubResellerInternal(
  creatorId: string,
  email: string,
  fullName: string,
  phone: string
) {
  // 1. Verify creator has an active subscription
  const { data: sub, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("status, expires_at")
    .eq("user_id", creatorId)
    .single();

  if (subError || !sub) {
    throw new Error("Você precisa ter uma assinatura ativa para criar sub-revendedores.");
  }

  const isTrial = sub.status === "trial";
  const isActive = sub.status === "active";
  const now = new Date();
  const expiresAt = new Date(sub.expires_at);

  if (!((isTrial || isActive) && expiresAt > now)) {
    throw new Error("Sua assinatura expirou. Renove para criar sub-revendedores.");
  }

  // 2. Get creator's referral code
  const { data: creatorProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("referral_code")
    .eq("id", creatorId)
    .single();

  if (profileError || !creatorProfile?.referral_code) {
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
      referral_code: creatorProfile.referral_code
    }
  });

  if (authError) {
    if (authError.message.includes("already exists")) {
      throw new Error("Este e-mail já está cadastrado.");
    }
    throw new Error(`Erro ao criar usuário: ${authError.message}`);
  }

  const userId = newUser.user.id;

  // 4. Update the new user's profile with the trial and referrer
  // The 'profiles' trigger might have already created the profile, so we use upsert or update
  const { error: updateProfileError } = await supabaseAdmin
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      referred_by: creatorId,
      signup_bonus_days: 1 // 1 day trial as requested
    })
    .eq("id", userId);

  if (updateProfileError) {
    console.error("Error updating profile:", updateProfileError);
  }

  // 5. Create the subscription for the new user (1 day trial)
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 1);

  const { error: createSubError } = await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      plan: "trial",
      status: "trial",
      expires_at: trialExpiresAt.toISOString()
    });

  if (createSubError) {
    console.error("Error creating subscription:", createSubError);
  }

  // 6. Record the referral
  const { error: referralError } = await supabaseAdmin
    .from("referrals")
    .insert({
      referrer_id: creatorId,
      referred_id: userId,
      code_used: creatorProfile.referral_code,
      status: "trial_active"
    });

  if (referralError) {
    console.error("Error recording referral:", referralError);
  }

  return { 
    id: userId, 
    email, 
    password: tempPassword 
  };
}
