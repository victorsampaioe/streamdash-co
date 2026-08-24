import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso restrito a administradores");
}

export type MonitorHealth = {
  counts: {
    total: number;
    serverDown: number;
    serverDegraded: number;
    dnsOffline: number;
    dnsUnstable: number;
    dnsOnlyProblem: number;
    stale: number;
  };
  stale: Array<{
    id: string;
    host: string;
    current_status: string | null;
    dns_status: string | null;
    last_checked_at: string | null;
  }>;
  sweeps: Array<{
    id: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    total: number;
    processed: number;
    offline_found: number;
    fixed: number;
    requeued: number;
    errors: number;
  }>;
};

export const getMonitorHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitorHealth> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: servers } = await supabaseAdmin
      .from("servers")
      .select("id, host, current_status, dns_status, last_checked_at, monitoring_paused")
      .eq("monitoring_paused", false)
      .limit(1000);

    const list = (servers ?? []) as any[];
    const staleCut = Date.now() - 15 * 60_000;
    const stale = list.filter(
      (s) => !s.last_checked_at || new Date(s.last_checked_at).getTime() < staleCut,
    );

    const { data: sweeps } = await supabaseAdmin
      .from("monitor_sweeps")
      .select("id, started_at, finished_at, status, total, processed, offline_found, fixed, requeued, errors")
      .order("started_at", { ascending: false })
      .limit(15);

    return {
      counts: {
        total: list.length,
        serverDown: list.filter((s) => s.current_status === "down").length,
        serverDegraded: list.filter((s) => s.current_status === "degraded").length,
        dnsOffline: list.filter((s) => s.dns_status === "offline").length,
        dnsUnstable: list.filter((s) => s.dns_status === "unstable").length,
        dnsOnlyProblem: list.filter(
          (s) => s.dns_status === "offline" && s.current_status !== "down",
        ).length,
        stale: stale.length,
      },
      stale: stale.slice(0, 20).map((s) => ({
        id: s.id,
        host: s.host,
        current_status: s.current_status,
        dns_status: s.dns_status,
        last_checked_at: s.last_checked_at,
      })),
      sweeps: (sweeps ?? []) as MonitorHealth["sweeps"],
    };
  });

export const runMonitorSweepNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runMonitorSweep } = await import("./monitor-sweep.server");
    return await runMonitorSweep("manual");
  });
