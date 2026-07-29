import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const listingCategories = [
  "credits","panel","dedicated","vps","hosting","cdn","proxy","domain","cloudflare",
  "service_setup","service_install","service_migration","service_dns","service_dev",
  "service_bot","service_site","service_landing","service_app",
  "partnership","help","other",
] as const;

const createListingSchema = z.object({
  kind: z.enum(["offer","demand"]),
  category: z.enum(listingCategories),
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(2000),
  price_cents: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
});

export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createListingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("listings" as any)
      .insert({ ...data, author_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listing_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("hub_start_conversation" as any, { _listing_id: data.listing_id });
    if (error) throw new Error(error.message);
    return { conversation_id: id as unknown as string };
  });

export const updateHubProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    handle: z.string().trim().min(3).max(24).regex(/^[a-z0-9_]+$/, "só letras minúsculas, números e _"),
    bio: z.string().trim().max(500).nullable().optional(),
    location: z.string().trim().max(120).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("hub_profiles" as any)
      .update({ handle: data.handle, bio: data.bio ?? null, location: data.location ?? null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ doc_path: z.string().min(3).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("hub_profiles" as any)
      .update({ verification_status: "pending", verification_doc_path: data.doc_path })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reportItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    target_kind: z.enum(["listing","user","message"]),
    target_id: z.string().uuid(),
    reason: z.enum(["spam","scam","contact_leak","offensive","other"]),
    detail: z.string().trim().max(500).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("hub_reports" as any).insert({
      ...data, reporter_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    conversation_id: z.string().uuid(),
    ratee_id: z.string().uuid(),
    stars: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ratings" as any).insert({
      ...data, rater_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminReviewVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    user_id: z.string().uuid(),
    decision: z.enum(["approved","rejected"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role" as any, {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("hub_profiles" as any).update({
      verification_status: data.decision,
      verified_at: data.decision === "approved" ? new Date().toISOString() : null,
    }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
