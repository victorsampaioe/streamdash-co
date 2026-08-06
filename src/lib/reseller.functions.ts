import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planSchema = z.object({
  name: z.string().min(2),
  price: z.number().min(0),
  duration_days: z.number().int().min(1),
  kind: z.enum(["plan", "credits"]).optional().default("plan"),
  credits_amount: z.number().int().min(0).nullable().optional(),
  features: z.array(z.string()).optional(),
});

export const getResellerPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reseller_plans")
      .select("*")
      .eq("reseller_id", context.userId)
      .order("price_cents", { ascending: true });
    
    if (error) throw new Error(error.message);
    return data;
  });

export const getParentResellerPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 1. Get the owner from the tree
    const { data: tree } = await context.supabase
      .from("reseller_tree")
      .select("owner_id, parent_reseller_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const ownerId = tree?.owner_id;

    // 2. Fetch plans from the immediate parent or owner
    const rawTargetId = tree?.parent_reseller_id || ownerId;

    // Linked admin accounts share the main admin's commercial settings
    let targetResellerId = rawTargetId;
    if (rawTargetId) {
      const { data: mainAccount } = await context.supabase.rpc("get_owner_account_id", {
        _user_id: rawTargetId,
      });
      if (mainAccount) targetResellerId = mainAccount as string;
    }

    if (!targetResellerId) {
      // Fallback if no tree entry exists (direct customer of system)
      const { data: admin } = await context.supabase
        .from("profiles")
        .select("whatsapp, phone, full_name")
        .eq("email", "victorsampaio133@gmail.com")
        .maybeSingle();
      
      return { plans: [], parent: admin };
    }

    const [plansRes, parentRes, settingsRes] = await Promise.all([
      context.supabase
        .from("reseller_plans")
        .select("*")
        .eq("reseller_id", targetResellerId)
        .order("price_cents", { ascending: true }),
      context.supabase
        .from("profiles")
        .select("whatsapp, phone, full_name, email")
        .eq("id", targetResellerId)
        .maybeSingle(),
      context.supabase
        .rpc("get_parent_reseller_pricing", { _reseller_id: targetResellerId })
        .maybeSingle()
    ]);

    
    if (plansRes.error) throw new Error(plansRes.error.message);
    
    // Merge standard settings if no custom plans found
    let plans = plansRes.data || [];
    if (plans.length === 0 && settingsRes.data) {
      // Create virtual plans based on reseller_settings if they exist
      plans = [
        { id: 'monthly', name: 'Mensal', price_cents: settingsRes.data.monthly_price_cents, duration_days: 30, kind: 'plan' },
        { id: 'quarterly', name: 'Trimestral', price_cents: settingsRes.data.quarterly_price_cents, duration_days: 90, kind: 'plan' },
        { id: 'annual', name: 'Anual', price_cents: settingsRes.data.annual_price_cents, duration_days: 365, kind: 'plan' }
      ] as any;
    }

    return { 
      plans, 
      parent: parentRes.data,
      settings: settingsRes.data
    };
  });

export const saveResellerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    pix_key: z.string().optional(),
    pix_name: z.string().optional(),
    monthly_price: z.number().optional(),
    quarterly_price: z.number().optional(),
    annual_price: z.number().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      pix_key: data.pix_key,
      pix_name: data.pix_name,
      monthly_price_cents: data.monthly_price ? Math.round(data.monthly_price * 100) : undefined,
      quarterly_price_cents: data.quarterly_price ? Math.round(data.quarterly_price * 100) : undefined,
      annual_price_cents: data.annual_price ? Math.round(data.annual_price * 100) : undefined,
      updated_at: new Date().toISOString()
    };

    const { error } = await context.supabase
      .from("reseller_settings")
      .upsert({ ...payload, reseller_id: context.userId }, { onConflict: 'reseller_id' });
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveResellerPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid().optional(),
    plan: planSchema
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, plan } = data;
    const payload = {
      name: plan.name,
      price_cents: Math.round(plan.price * 100),
      duration_days: plan.duration_days,
      kind: plan.kind ?? "plan",
      credits_amount: plan.kind === "credits" ? (plan.credits_amount ?? 0) : null,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { error } = await context.supabase
        .from("reseller_plans")
        .update(payload)
        .eq("id", id)
        .eq("reseller_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("reseller_plans")
        .insert({ ...payload, reseller_id: context.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteResellerPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reseller_plans")
      .delete()
      .eq("id", data.id)
      .eq("reseller_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getResellerNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tree, error } = await context.supabase
      .from("reseller_tree")
      .select(`
        user_id,
        profiles!reseller_tree_user_id_fkey (
          id, full_name, email, created_at, is_reseller
        ),
        reseller_wallet ( credits )
      `)
      .eq("parent_reseller_id", context.userId);

    if (error) throw new Error(error.message);
    return tree?.map(t => ({
      ...t.profiles,
      credits: (t.reseller_wallet as any)?.[0]?.credits || 0
    })) || [];
  });

export const getCreditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reseller_credit_history")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  });

export const getResellerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [walletRes, treeRes, plansRes] = await Promise.all([
      context.supabase.from("reseller_wallet").select("credits").eq("reseller_id", context.userId).maybeSingle(),
      context.supabase.from("reseller_tree").select("user_id").eq("parent_reseller_id", context.userId),
      context.supabase.from("reseller_plans").select("id").eq("reseller_id", context.userId)
    ]);

    const userIds = treeRes.data?.map(t => t.user_id) || [];
    
    // Get profiles for these users to distinguish sub-resellers from clients
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, is_reseller")
      .in("id", userIds);

    const activeSubResellers = profiles?.filter(p => p.is_reseller).length || 0;
    const activeClients = profiles?.filter(p => !p.is_reseller).length || 0;

    let revenue = 0;
    if (plansRes.data && plansRes.data.length > 0) {
      const planIds = plansRes.data.map(p => p.id);
      const { data: payments } = await context.supabase
        .from("payments")
        .select("amount_cents")
        .eq("status", "approved")
        .in("plan_id", planIds);
      
      revenue = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;
    }

    return {
      credits: walletRes.data?.credits || 0,
      activeSubResellers,
      activeClients,
      revenue,
    };
  });

export const transferCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    recipientId: z.string().uuid(),
    amount: z.number().int().positive()
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("transfer_credits_v2", {
      _sender_id: context.userId,
      _recipient_id: data.recipientId,
      _amount: data.amount
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
