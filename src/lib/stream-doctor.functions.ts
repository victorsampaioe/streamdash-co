import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { analyzeStreamDoctor } from "./stream-doctor.engine";
import type { DoctorEvidence } from "./stream-doctor.engine";

const input = z.object({
  serverId: z.string().uuid(),
  device: z.enum(["smart_tv", "tv_box", "phone", "computer", "other"]),
  app: z.string().trim().max(60),
  symptom: z.enum(["buffering", "black_screen", "login", "vod", "channels", "audio", "other"]),
  when: z.enum(["now", "today", "recurring", "unknown"]),
});

/** Reads only servers visible through the user's RLS-scoped session. */
export const runStreamDoctor = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((payload: z.infer<typeof input>) => input.parse(payload))
  .handler(async ({ data, context }) => {
    const { data: server, error: srvError } = await context.supabase.from("servers")
      .select("id,name,current_status,last_checked_at,last_latency_ms,dns_status,monitoring_paused")
      .eq("id", data.serverId).maybeSingle();
    if (srvError || !server) throw new Error("Servidor não encontrado ou sem permissão.");

    const [checks, regions, incidents] = await Promise.all([
      context.supabase.from("checks").select("status,checked_at,http_status,latency_ms")
        .eq("server_id", server.id).order("checked_at", { ascending: false }).limit(15),
      context.supabase.from("region_checks").select("region_code,status,checked_at")
        .eq("server_id", server.id).order("checked_at", { ascending: false }).limit(24),
      context.supabase.from("incidents").select("started_at,ended_at")
        .eq("server_id", server.id).order("started_at", { ascending: false }).limit(5),
    ]);
    // Do not silently interpret database errors as "no incidents" or healthy.
    if (checks.error || regions.error || incidents.error) {
      throw new Error("Não foi possível carregar as evidências do monitoramento. Tente novamente.");
    }
    const snapshot: DoctorEvidence = {
      name: server.name,
      status: server.current_status ?? "unknown",
      checkedAt: server.last_checked_at,
      latency: server.last_latency_ms,
      dnsStatus: server.dns_status,
      paused: server.monitoring_paused === true,
      recentChecks: (checks.data ?? []).map(c => ({
        status: c.status, checked_at: c.checked_at, http_status: c.http_status, latency_ms: c.latency_ms
      })),
      regions: (regions.data ?? []).map(r => ({
        region_code: r.region_code, status: r.status, checked_at: r.checked_at
      })),
      incidents: (incidents.data ?? []).map(i => ({
        started_at: i.started_at, ended_at: i.ended_at
      })),
    };
    return { serverName: server.name, report: analyzeStreamDoctor(data, snapshot) };
  });
