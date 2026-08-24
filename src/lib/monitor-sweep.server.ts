/**
 * Varredura de reconciliação do monitoramento.
 *
 * Objetivo: nenhum servidor fica "esquecido" e nenhum estado fica errado.
 *  - Servidor marcado OFFLINE que na verdade responde → corrigido e incidente fechado.
 *  - Servidor sem verificação há muito tempo → reenfileirado com prioridade máxima.
 *  - Incidentes abertos de servidores que voltaram → encerrados.
 * Cada varredura é registrada em monitor_sweeps (painel de auditoria).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STALE_MINUTES = 15;

export type SweepResult = {
  sweepId: string | null;
  total: number;
  processed: number;
  offlineFound: number;
  fixed: number;
  requeued: number;
  errors: number;
};

export async function runMonitorSweep(trigger = "cron"): Promise<SweepResult> {
  const startedIso = new Date().toISOString();
  const { data: sweep } = await supabaseAdmin
    .from("monitor_sweeps")
    .insert({ trigger, status: "running", started_at: startedIso } as any)
    .select("id")
    .maybeSingle<{ id: string }>();
  const sweepId = sweep?.id ?? null;

  const result: SweepResult = {
    sweepId,
    total: 0,
    processed: 0,
    offlineFound: 0,
    fixed: 0,
    requeued: 0,
    errors: 0,
  };

  try {
    const { data: servers } = await supabaseAdmin
      .from("servers")
      .select("id, host, current_status, dns_status, last_checked_at, interval_seconds, consecutive_failures")
      .eq("monitoring_paused", false)
      .limit(500);

    const list = servers ?? [];
    result.total = list.length;

    const { verifyService, lastKnownIp, computePriority } = await import("./monitor-state.server");
    const { closeOfflineIncident } = await import("./alert-gate.server");
    const nowMs = Date.now();

    for (const s of list as any[]) {
      result.processed++;
      try {
        const stale =
          !s.last_checked_at || nowMs - new Date(s.last_checked_at).getTime() > STALE_MINUTES * 60_000;

        if (s.current_status === "down") {
          result.offlineFound++;
          const fallbackIp = await lastKnownIp(s.id).catch(() => null);
          const verdict = await verifyService({
            serverId: s.id,
            host: String(s.host || "")
              .replace(/^https?:\/\//i, "")
              .replace(/\/.*$/, "")
              .split(":")[0],
            fallbackIp,
          });
          if (verdict.online) {
            await supabaseAdmin
              .from("servers")
              .update({
                current_status: verdict.unstable ? "degraded" : "up",
                consecutive_failures: 0,
                last_success_at: new Date().toISOString(),
                last_state_change_at: new Date().toISOString(),
                next_check_at: null,
                check_priority: 2,
              } as any)
              .eq("id", s.id);
            await closeOfflineIncident(s.id, "server").catch(() => null);
            result.fixed++;
            continue;
          }
        }

        if (stale) {
          await supabaseAdmin
            .from("servers")
            .update({
              next_check_at: null,
              check_priority: computePriority({
                serverStatus: s.current_status,
                dnsStatus: s.dns_status,
                hasOpenIncident: false,
                overdue: true,
              }),
            } as any)
            .eq("id", s.id);
          result.requeued++;
        }
      } catch {
        result.errors++;
      }
    }
  } catch {
    result.errors++;
  }

  if (sweepId) {
    await supabaseAdmin
      .from("monitor_sweeps")
      .update({
        finished_at: new Date().toISOString(),
        status: result.errors > 0 ? "completed_with_errors" : "completed",
        total: result.total,
        processed: result.processed,
        offline_found: result.offlineFound,
        fixed: result.fixed,
        requeued: result.requeued,
        errors: result.errors,
      } as any)
      .eq("id", sweepId);
  }

  return result;
}
