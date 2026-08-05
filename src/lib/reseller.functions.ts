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
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("parent_id")
      .eq("id", context.userId)
      .maybeSingle();

    if (!profile?.parent_id) return { plans: [], parent: null };

    const [plansRes, parentRes] = await Promise.all([
      context.supabase
        .from("reseller_plans")
        .select("*")
        .eq("reseller_id", profile.parent_id)
        .order("price_cents", { ascending: true }),
      context.supabase
        .from("profiles")
        .select("whatsapp, phone, full_name")
        .eq("id", profile.parent_id)
        .maybeSingle()
    ]);
    
    if (plansRes.error) throw new Error(plansRes.error.message);
    
    return { 
      plans: plansRes.data || [], 
      parent: parentRes.data 
    };
  });

export const saveResellerPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid().optional(),
    plan: planSchema
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, plan } = data;
    // Map price to price_cents
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
    const { data: members, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, credits, is_reseller, created_at")
      .eq("parent_id", context.userId);

    if (error) throw new Error(error.message);
    return members || [];
  });

export const getCreditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credit_history")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  });

export const getResellerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("credits")
      .eq("id", context.userId)
      .single();

    // Active sub-resellers (those with is_reseller = true)
    const { count: activeSubResellers } = await context.supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", context.userId)
      .eq("is_reseller", true);

    // Active clients (those with is_reseller = false)
    const { count: activeClients } = await context.supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", context.userId)
      .eq("is_reseller", false);

    // Revenue calculation: Sum of all payments for plans created by this reseller
    // Note: We need to filter payments where the plan belongs to the reseller
    const { data: myPlans } = await context.supabase
      .from("reseller_plans")
      .select("id")
      .eq("reseller_id", context.userId);

    let revenue = 0;
    if (myPlans && myPlans.length > 0) {
      const planIds = myPlans.map(p => p.id);
      const { data: payments } = await context.supabase
        .from("payments")
        .select("amount_cents")
        .eq("status", "approved")
        .in("plan_id", planIds);
      
      revenue = payments?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;
    }

    return {
      credits: profile?.credits || 0,
      activeSubResellers: activeSubResellers || 0,
      activeClients: activeClients || 0,
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
    const { error } = await context.supabase.rpc("transfer_credits", {
      _sender_id: context.userId,
      _recipient_id: data.recipientId,
      _amount: data.amount
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
