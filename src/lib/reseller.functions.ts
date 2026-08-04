import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planSchema = z.object({
  name: z.string().min(2),
  price: z.number().min(0),
  duration_days: z.number().int().min(1),
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
      .single();

    if (!profile?.parent_id) return [];

    const { data, error } = await context.supabase
      .from("reseller_plans")
      .select("*")
      .eq("reseller_id", profile.parent_id)
      .order("price_cents", { ascending: true });
    
    if (error) throw new Error(error.message);
    return data;
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
    const { data: subResellers, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, credits, created_at")
      .eq("parent_id", context.userId);

    if (error) throw new Error(error.message);
    return subResellers || [];
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

    const { count: activeClients } = await context.supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", context.userId);

    return {
      credits: profile?.credits || 0,
      activeClients: activeClients || 0,
      revenue: 0,
    };
  });
