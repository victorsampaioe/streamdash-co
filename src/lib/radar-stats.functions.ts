import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getIptvRadarStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_iptv_radar_stats");
    if (error) throw new Error(error.message);
    return data as {
      total_db_servers: number;
      with_host: number;
      with_username: number;
      with_password: number;
      login_approved: number;
      total_monitored: number;
      configured_iptv: number;
      waiting_credentials: number;
      total_contents: number;
      first_detections: number;
      excluded_reasons: {
        no_username: number;
        no_password: number;
        invalid_login: number;
        paused: number;
        inactive_account: number;
      };
    };
  });

export const prepareRadarBatchSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: batch, error: batchErr } = await context.supabase.rpc("run_radar_batch_sync");
    if (batchErr) throw new Error(batchErr.message);

    const { data: stats, error: statsErr } = await context.supabase.rpc("get_iptv_radar_stats");
    if (statsErr) throw new Error(statsErr.message);

    return {
      ...(batch as any),
      ...(stats as any)
    } as {
      servers_found: number;
      server_ids: string[];
      total_monitored: number;
      configured_iptv: number;
      waiting_credentials: number;
    };
  });

export const runRadarBatchSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverIds: string[] }) => z.object({ serverIds: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data }) => {
    const { runIptvSync } = await import("./iptv.server");
    const results = [];
    for (const id of data.serverIds) {
      try {
        await runIptvSync(id, { mode: "full", force: true });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    return { results };
  });
