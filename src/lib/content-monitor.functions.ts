import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

async function assertOwnership(context: any, serverId: string) {
  const { data } = await context.supabase
    .from("servers").select("id").eq("id", serverId).maybeSingle();
  if (!data) throw new Error("Servidor não encontrado ou sem permissão");
}

export const importContentCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string; force?: boolean }) =>
    z.object({ serverId: z.string().uuid(), force: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnership(context, data.serverId);
    const { importServerCatalog } = await import("./content-monitor.server");
    return await importServerCatalog(data.serverId, { force: data.force ?? false });
  });

export const scanServerContents = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string; batch?: number; concurrency?: number; safe?: boolean }) =>
    z.object({
      serverId: z.string().uuid(),
      batch: z.number().min(1).max(300).optional(),
      concurrency: z.number().min(1).max(50).optional(),
      safe: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnership(context, data.serverId);
    const { runContentScan } = await import("./content-monitor.server");
    const { runOnCore } = await import("./core-api.server");
    const safe = data.safe ?? true;
    const options = {
      batch: data.batch ?? (safe ? 40 : 60),
      concurrency: data.concurrency ?? (safe ? 5 : 20),
      manual: true,
      safe,
      ignoreCooldown: true,
      userId: context.userId,
    };
    return await runOnCore<Awaited<ReturnType<typeof runContentScan>>>(
      "content-scan",
      { serverId: data.serverId, options },
      () => runContentScan(data.serverId, options),
    );
  });

export const turboScanServer = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string; sample?: number; concurrency?: number }) =>
    z.object({
      serverId: z.string().uuid(),
      sample: z.number().min(5).max(120).optional(),
      concurrency: z.number().min(1).max(50).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnership(context, data.serverId);
    const { runTurboScan } = await import("./content-monitor.server");
    return await runTurboScan(data.serverId, {
      sample: data.sample ?? 24,
      concurrency: data.concurrency ?? 5,
      userId: context.userId,
    });
  });

/** Estado do Modo Seguro (freio adaptativo) do servidor. */
export const getSafeModeStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnership(context, data.serverId);
    const { getThrottle, isCoolingDown, THROTTLE_FACTOR } = await import("./content-safe.server");
    const t = await getThrottle(data.serverId);
    return {
      level: t.level,
      cooldownUntil: t.cooldownUntil,
      cooling: isCoolingDown(t),
      lastBlockAt: t.lastBlockAt,
      factor: THROTTLE_FACTOR[Math.min(t.level, THROTTLE_FACTOR.length - 1)],
    };
  });


export const recheckContent = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { contentId: string }) => z.object({ contentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("monitored_contents").select("id, server_id").eq("id", data.contentId).maybeSingle();
    if (!row) throw new Error("Conteúdo não encontrado ou sem permissão");
    const { runContentScan } = await import("./content-monitor.server");
    return await runContentScan(row.server_id, {
      contentIds: [row.id], manual: true, userId: context.userId, ignoreCooldown: true,
    });
  });

export const importEpisodes = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string; seriesId: string }) =>
    z.object({ serverId: z.string().uuid(), seriesId: z.string().min(1).max(32) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnership(context, data.serverId);
    const { importSeriesEpisodes } = await import("./content-monitor.server");
    return await importSeriesEpisodes(data.serverId, data.seriesId);
  });

export const getBrokenCatalogInsights = createServerFn({ method: "GET" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const { brokenCatalogInsights } = await import("./content-monitor.server");
    return await brokenCatalogInsights(context.userId);
  });

export const toggleContentFavorite = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { contentId: string; favorite: boolean }) =>
    z.object({ contentId: z.string().uuid(), favorite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("monitored_contents")
      .update({ is_favorite: data.favorite, priority: data.favorite ? 9 : 5 })
      .eq("id", data.contentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveContentAlertSettings = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: {
    notify_movies: boolean; notify_series: boolean; notify_channels: boolean;
    notify_recovery: boolean; notify_only_favorites: boolean; minimum_failures: number;
    telegram_enabled: boolean;
  }) => z.object({
    notify_movies: z.boolean(), notify_series: z.boolean(), notify_channels: z.boolean(),
    notify_recovery: z.boolean(), notify_only_favorites: z.boolean(),
    minimum_failures: z.number().min(1).max(10), telegram_enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_alert_settings")
      .upsert({ ...data, user_id: context.userId, server_id: null }, { onConflict: "user_id,server_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
