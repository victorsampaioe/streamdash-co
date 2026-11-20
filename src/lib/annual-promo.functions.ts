import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveAnnualPromo } from "./annual-promo.server";

/** Only authenticated accounts can view the temporary offer. */
export const getAnnualPromo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.userId) return null;
    return getActiveAnnualPromo();
  });
