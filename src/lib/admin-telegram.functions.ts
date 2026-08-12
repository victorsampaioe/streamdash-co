import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getReactivationStats, runReactivationCampaign, notifyAdminSignup } from "./admin-telegram.server";

export const getReactivationInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    return getReactivationStats();
  });

export const triggerReactivationCampaign = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ manual: z.boolean().optional() }).parse(data))
  .handler(async ({ data }) => {
    return runReactivationCampaign(data.manual ?? false);
  });

export const getReactivationHistory = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("reactivation_logs" as any)
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(10);
    return data || [];
  });

export const notifySignup = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string(), name: z.string(), phone: z.string(), referralCode: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    return notifyAdminSignup(data);
  });

export const notifyAdminSignupFn = notifySignup;
