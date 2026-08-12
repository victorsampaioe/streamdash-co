import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getReactivationStats, runReactivationCampaign } from "./admin-telegram.server";

export const getReactivationInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    return getReactivationStats();
  });

export const triggerReactivationCampaign = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ manual: z.boolean().optional() }).parse(data))
  .handler(async ({ data }) => {
    return runReactivationCampaign(data.manual ?? false);
  });
