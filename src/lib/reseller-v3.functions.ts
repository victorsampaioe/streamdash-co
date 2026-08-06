import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLANS = {
  trial: { days: 1, credits: 0, plan: "trial", status: "trial", label: "Teste 1 dia" },
  monthly: { days: 30, credits: 1, plan: "monthly", status: "active", label: "Mensal" },
  quarterly: { days: 90, credits: 3, plan: "quarterly", status: "active", label: "Trimestral" },
  semiannual: { days: 180, credits: 6, plan: "semiannual", status: "active", label: "Semestral" },
  annual: { days: 365, credits: 12, plan: "yearly", status: "active", label: "Anual" },
} as const;

const createClientSchema = z.object({
  fullName: z.string().min(2),
  whatsapp: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6).optional().or(z.literal("")),
  plan: z.enum(["trial", "monthly", "quarterly", "semiannual", "annual"]).default("trial"),
});

const createSubResellerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().optional().or(z.literal("")),
  initialCredits: z.number().min(10, "Mínimo 10 créditos"),
});

function randomPassword() {
  return `Stream@${Math.random().toString(36).substring(2, 8)}!`;
}


/** Reads the creator's real state from the tables that actually hold it. */
async function loadCreator(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: ownerAccount }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("get_owner_account_id", { _user_id: userId }),
  ]);

  // Linked admin accounts act as the main admin account (shared clients/settings/credits)
  const accountId = (isAdmin && (ownerAccount as string | null)) || userId;

  const [{ data: profile }, { data: wallet }, { data: tree }] = await Promise.all([
    supabase.from("profiles").select("is_reseller, full_name").eq("id", accountId).maybeSingle(),
    supabase.from("reseller_wallet").select("credits").eq("reseller_id", accountId).maybeSingle(),
    supabase.from("reseller_tree").select("owner_id").eq("user_id", accountId).maybeSingle(),
  ]);
  return {
    accountId,
    isAdmin: !!isAdmin,
    isReseller: !!profile?.is_reseller,
    credits: wallet?.credits ?? 0,
    ownerId: (tree?.owner_id as string | null) ?? accountId,
  };
}

export const createTestClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createClientSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const creator = await loadCreator(supabase, userId);
    if (!creator.isAdmin && !creator.isReseller) {
      throw new Error("Apenas revendedores podem criar clientes.");
    }

    const cfg = PLANS[data.plan ?? "trial"];
    const cost = creator.isAdmin ? 0 : cfg.credits;
    if (cost > 0 && creator.credits < cost) {
      throw new Error(`Saldo insuficiente. Plano ${cfg.label} custa ${cost} crédito(s) e você tem ${creator.credits}.`);
    }

    const email = data.email || `cliente_${Math.random().toString(36).substring(2, 9)}@streammonitor.site`;
    const password = data.password || randomPassword();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (authError) throw new Error(`Erro ao criar acesso: ${authError.message}`);
    const newUserId = authData.user.id;

    const expires = new Date(Date.now() + cfg.days * 24 * 60 * 60 * 1000).toISOString();

    const profilePatch: Record<string, unknown> = {
      full_name: data.fullName,
      parent_id: creator.accountId,
      is_reseller: false,
    };
    if (data.whatsapp) {
      profilePatch.whatsapp = data.whatsapp;
      profilePatch.phone = data.whatsapp;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profilePatch as any)
      .eq("id", newUserId);
    if (profileError) throw new Error(profileError.message);

    // Clients depend only on the subscription window
    const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: newUserId,
        plan: cfg.plan,
        status: cfg.status,
        started_at: new Date().toISOString(),
        expires_at: expires,
      } as any,
      { onConflict: "user_id" }
    );
    if (subError) throw new Error(subError.message);

    // Hierarchy: client belongs to its creator, owner is the top of the tree
    const { error: treeError } = await supabaseAdmin.from("reseller_tree").upsert(
      { user_id: newUserId, parent_reseller_id: creator.accountId, owner_id: creator.ownerId } as any,
      { onConflict: "user_id" }
    );
    if (treeError) throw new Error(treeError.message);

    if (cost > 0) {
      const { error: walletError } = await supabaseAdmin
        .from("reseller_wallet")
        .update({ credits: creator.credits - cost, updated_at: new Date().toISOString() } as any)
        .eq("reseller_id", creator.accountId);
      if (walletError) throw new Error(walletError.message);
    }

    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: creator.accountId,
      amount: -cost,
      type: "client_creation",
      description: `Criou cliente ${data.fullName} — plano ${cfg.label} (${cfg.days} dias)`,
    });

    return { success: true, email, password, expiresAt: expires, plan: cfg.label, creditsUsed: cost };
  });


export const createSubReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createSubResellerSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const creator = await loadCreator(supabase, userId);
    if (!creator.isAdmin && !creator.isReseller) {
      throw new Error("Apenas revendedores podem criar sub-revendedores.");
    }
    if (!creator.isAdmin && creator.credits < data.initialCredits) {
      throw new Error(`Saldo insuficiente. Você tem ${creator.credits} crédito(s).`);
    }

    const password = randomPassword();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (authError) throw new Error(`Erro ao criar acesso: ${authError.message}`);
    const newUserId = authData.user.id;

    // Role: sub_reseller only (the signup trigger adds a default "user" role)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId).eq("role", "user" as any);
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newUserId, role: "sub_reseller" as any }, { onConflict: "user_id,role" });

    const subProfilePatch: Record<string, unknown> = {
      full_name: data.fullName,
      parent_id: creator.accountId,
      is_reseller: true,
    };
    if (data.whatsapp) {
      subProfilePatch.whatsapp = data.whatsapp;
      subProfilePatch.phone = data.whatsapp;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(subProfilePatch as any)
      .eq("id", newUserId);
    if (profileError) throw new Error(profileError.message);


    // Resellers do not depend on subscription — keep a consistent "reseller" row
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);
    await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: newUserId,
        plan: "reseller",
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: farFuture.toISOString(),
      } as any,
      { onConflict: "user_id" }
    );

    const { error: treeError } = await supabaseAdmin.from("reseller_tree").upsert(
      { user_id: newUserId, parent_reseller_id: creator.accountId, owner_id: creator.ownerId } as any,
      { onConflict: "user_id" }
    );
    if (treeError) throw new Error(treeError.message);

    // Wallet + commercial settings inherited from the parent reseller
    await supabaseAdmin
      .from("reseller_wallet")
      .upsert({ reseller_id: newUserId, credits: 0 } as any, { onConflict: "reseller_id", ignoreDuplicates: true });

    const { data: parentSettings } = await supabaseAdmin
      .from("reseller_settings")
      .select("monthly_price_cents, quarterly_price_cents, annual_price_cents")
      .eq("reseller_id", creator.accountId)
      .maybeSingle();

    await supabaseAdmin.from("reseller_settings").upsert(
      {
        reseller_id: newUserId,
        monthly_price_cents: parentSettings?.monthly_price_cents ?? 3500,
        quarterly_price_cents: parentSettings?.quarterly_price_cents ?? 9000,
        annual_price_cents: parentSettings?.annual_price_cents ?? 29900,
      } as any,
      { onConflict: "reseller_id", ignoreDuplicates: true }
    );



    // Single source of truth for credits: the wallet (deducts sender, credits recipient)
    const { error: creditError } = await supabaseAdmin.rpc("transfer_credits_v2", {
      _sender_id: creator.accountId,
      _recipient_id: newUserId,
      _amount: data.initialCredits,
    });
    if (creditError) throw new Error(creditError.message);

    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: creator.accountId,
      amount: -data.initialCredits,
      type: "reseller_creation",
      description: `Criou sub-revendedor ${data.fullName} — ${data.initialCredits} créditos`,
    });

    return { success: true, email: data.email, password };
  });
