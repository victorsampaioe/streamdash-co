import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function createSubResellerInternal(
  creatorId: string,
  email: string,
  fullName: string,
  isReseller: boolean = true,
  initialCredits: number = 10
) {
  // 1. Verify creator has credits
  const { data: creatorProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, credits, is_reseller")
    .eq("id", creatorId)
    .single();

  if (profileError || !creatorProfile) {
    throw new Error("Erro ao obter seu perfil. Verifique sua conta.");
  }

  // Verify creator has an active subscription or is admin
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: creatorId,
    _role: "admin",
  });

  // Check if reseller has enough credits
  const minCreditsRequired = isReseller ? initialCredits : 0;
  const creatorCredits = creatorProfile.credits || 0;
  
  if (!isAdmin && isReseller && creatorCredits < minCreditsRequired) {
    throw new Error(`Saldo insuficiente. Você tem ${creatorCredits} créditos, mas precisa de no mínimo ${minCreditsRequired} para esta operação.`);
  }

  if (!isAdmin && creatorCredits <= 0) {
    throw new Error("Seu saldo de créditos acabou. Recarregue para realizar esta operação.");
  }

  if (!isAdmin) {
    const { data: creatorActive } = await supabaseAdmin.rpc("subscription_is_active", { _user_id: creatorId });
    if (!creatorActive && !creatorProfile.is_reseller) {
      throw new Error("Sua conta precisa estar ativa para criar revendedores ou clientes.");
    }
  }

  // 2. Phone check removed

  // 3. Create the new user in Auth
  const tempPassword = Math.random().toString(36).slice(-12) + "!";
  
  const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      is_reseller: isReseller
    }
  });

  if (authError) {
    if (authError.message.includes("already exists")) {
      throw new Error("Este e-mail já está cadastrado no sistema.");
    }
    console.error("[createSubReseller] authError:", authError);
    throw new Error(`Não foi possível criar o acesso: ${authError.message}`);
  }

  const userId = newUser.user.id;

  // 4. Setup profile
  let profileSet = false;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        trial_used: true,
        parent_id: creatorId,
        is_reseller: isReseller,
        credits: isReseller ? initialCredits : 0,
        full_name: fullName
      } as any)
      .eq("id", userId)
      .select();

    if (!error && data && data.length > 0) {
      profileSet = true;
      break;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  if (!profileSet) {
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      parent_id: creatorId,
      is_reseller: isReseller,
      credits: isReseller ? initialCredits : 0,
      trial_used: true
    } as any);
  }

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
          type: 'purchase',
          description: `Créditos iniciais recebidos do revendedor criador`
        }
      ]);
  }

  // 5. Create the subscription (active for resellers/clients by default now)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      plan: isReseller ? ("reseller" as any) : ("basic" as any),
      status: "active" as any,
      expires_at: oneYearFromNow.toISOString()
    });

  return { 
    id: userId, 
    email, 
    password: tempPassword 
  };
}
