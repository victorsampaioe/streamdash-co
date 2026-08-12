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

export const notifySignup = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string(), name: z.string(), phone: z.string(), referralCode: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    return notifyAdminSignup(data);
  });

// Use the explicit export to avoid shadowing
export const notifyAdminSignupFn = notifySignup;
