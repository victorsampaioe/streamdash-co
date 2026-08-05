import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** 
 * This file is being replaced by reseller-v3.functions.ts logic for the dashboard.
 * We keep it for backward compatibility or direct imports if needed, 
 * but redirecting new logic to V3 schema.
 */

export const createResellerV2 = createServerFn({ method: "POST" })
  .inputValidator((data) => z.any().parse(data))
  .handler(async ({ data, context }) => {
     throw new Error("Utilize createTestClient ou createSubReseller de reseller-v3.functions.ts");
  });
