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
  const [{ data: isAdmin }, { data: profile }, { data: wallet }, { data: tree }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.from("profiles").select("is_reseller, full_name").eq("id", userId).maybeSingle(),
    supabase.from("reseller_wallet").select("credits").eq("reseller_id", userId).maybeSingle(),
    supabase.from("reseller_tree").select("owner_id").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    isAdmin: !!isAdmin,
    isReseller: !!profile?.is_reseller,
    credits: wallet?.credits ?? 0,
    ownerId: (tree?.owner_id as string | null) ?? userId,
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

    const email = data.email || `cliente_${Math.random().toString(36).substring(2, 9)}@streammonitor.site`;
    const password = randomPassword();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (authError) throw new Error(`Erro ao criar acesso: ${authError.message}`);
    const newUserId = authData.user.id;

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        whatsapp: data.whatsapp,
        phone: data.whatsapp,
        parent_id: userId,
        is_reseller: false,
      } as any)
      .eq("id", newUserId);
    if (profileError) throw new Error(profileError.message);

    // 1-day trial subscription (clients depend only on subscription)
    const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: newUserId,
        plan: "trial",
        status: "trial",
        started_at: new Date().toISOString(),
        expires_at: expires,
      } as any,
      { onConflict: "user_id" }
    );
    if (subError) throw new Error(subError.message);

    // Hierarchy: client belongs to its creator, owner is the top of the tree
    const { error: treeError } = await supabaseAdmin.from("reseller_tree").upsert(
      { user_id: newUserId, parent_reseller_id: userId, owner_id: creator.ownerId } as any,
      { onConflict: "user_id" }
    );
    if (treeError) throw new Error(treeError.message);

    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: userId,
      amount: 0,
      type: "client_creation",
      description: `Criou cliente teste ${data.fullName} — 1 dia grátis`,
    });

    return { success: true, email, password, expiresAt: expires };
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

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        whatsapp: data.whatsapp,
        phone: data.whatsapp,
        parent_id: userId,
        is_reseller: true,
      } as any)
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
      { user_id: newUserId, parent_reseller_id: userId, owner_id: creator.ownerId } as any,
      { onConflict: "user_id" }
    );
    if (treeError) throw new Error(treeError.message);

    // Single source of truth for credits: the wallet (deducts sender, credits recipient)
    const { error: creditError } = await supabaseAdmin.rpc("transfer_credits_v2", {
      _sender_id: userId,
      _recipient_id: newUserId,
      _amount: data.initialCredits,
    });
    if (creditError) throw new Error(creditError.message);

    await supabaseAdmin.from("reseller_credit_history").insert({
      user_id: userId,
      amount: -data.initialCredits,
      type: "reseller_creation",
      description: `Criou sub-revendedor ${data.fullName} — ${data.initialCredits} créditos`,
    });

    return { success: true, email: data.email, password };
  });
