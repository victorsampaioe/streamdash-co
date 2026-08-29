import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  version_code: z.number().int().min(1).max(2_000_000_000),
  version_name: z.string().min(1).max(40),
  minimum_version_code: z.number().int().min(1).max(2_000_000_000),
  recommended_version_code: z.number().int().min(1).max(2_000_000_000).optional(),
  mandatory: z.boolean(),
  message: z.string().max(500).optional(),
  update_url: z.string().url().max(500),
  signing_fingerprint: z.string().max(200).optional(),
  status: z.enum(["draft", "published", "archived"]),
});

export const listAppReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/app-releases-admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_releases")
      .select("*")
      .order("version_code", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const saveAppRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, persistRelease } = await import("@/lib/app-releases-admin.server");
    await assertAdmin(context.supabase, context.userId);
    return persistRelease(data, context.userId);
  });
