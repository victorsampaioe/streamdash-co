import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function createSubResellerInternal(
  creatorId: string,
  email: string,
  fullName: string,
  phone: string
) {
  // 1. Verify creator has an active subscription
  // Use public function to check activity
  const { data: creatorActive, error: activityError } = await supabaseAdmin.rpc("subscription_is_active", { _user_id: creatorId });
  
  if (activityError) {
    console.error("Error checking activity:", activityError);
  }

  if (!creatorActive) {
    throw new Error("Você precisa ter uma assinatura ativa para criar sub-revendedores.");
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

  // The 'handle_new_user' trigger will have already created the profile and recorded the referral
  // since we passed 'referral_code' in user_metadata.

  // 4. Mark trial as used and ensure phone is set correctly
  await supabaseAdmin
    .from("profiles")
    .update({
      trial_used: true,
      signup_bonus_days: 1
    })
    .eq("id", userId);

  // 5. Create the subscription for the new user (1 day trial)
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
    .update({ status: "trial_active" })
    .eq("referred_id", userId);

  return { 
    id: userId, 
    email, 
    password: tempPassword 
  };
}
