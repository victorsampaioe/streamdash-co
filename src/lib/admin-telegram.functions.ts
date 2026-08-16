import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getReactivationStats, runReactivationCampaign, notifyAdminSignup } from "./admin-telegram.server";

async function assertAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !isAdmin) throw new Error("Forbidden");
}

export const getReactivationInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return getReactivationStats();
  });

export const triggerReactivationCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ manual: z.boolean().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return runReactivationCampaign(data.manual ?? false);
  });

export const getReactivationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pegar logs individuais
    const { data: logs } = await supabaseAdmin
      .from("reactivation_logs" as any)
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(10);

    // Pegar histórico de campanhas
    const { data: campaigns } = await supabaseAdmin
      .from("reactivation_campaigns" as any)
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5);

    return {
      logs: logs || [],
      campaigns: campaigns || []
    };
  });

export const notifySignup = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string(), name: z.string(), phone: z.string(), referralCode: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    return notifyAdminSignup(data);
  });

export const notifyAdminSignupFn = notifySignup;
