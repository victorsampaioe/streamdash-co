import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PerfRankingRow = {
  server_id: string;
  name: string;
  host: string;
  status: string;
  health_score: number | null;
  api_ms: number | null;
  open_ms: number | null;
  open_ms_24h: number | null;
  open_avg_ms: number | null;
  open_best_ms: number | null;
  open_worst_ms: number | null;
  stability_pct: number | null;
  measurements: number;
  last_measured_at: string | null;
};

export type PerfHistoryRow = {
  measured_at: string;
  api_ms: number | null;
  open_ms: number | null;
  ok: boolean;
  state: string;
  error: string | null;
};

/** Ranking agregado (mediana de 7 dias) — só servidores do usuário/admin. */
export const getPerformanceRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_performance_ranking", { _limit: 100 });
    if (error) throw new Error(error.message);
    return (data ?? []) as PerfRankingRow[];
  });

/** Histórico de medições de um servidor (para gráfico e lista). */
export const getServerPerfHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string; limit?: number }) =>
    z.object({ serverId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_server_perf_history", {
      _server_id: data.serverId,
      _limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PerfHistoryRow[];
  });

/** Executa um teste sob demanda (dono do servidor ou admin). */
export const runPerfTestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS garante que só o dono (ou admin) enxerga o servidor.
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { runServerPerfTest } = await import("./perf.server");
    const r = await runServerPerfTest(data.serverId);
    // Nunca devolvemos host, credenciais ou URLs internas.
    return {
      api_ms: r.api_ms,
      open_ms: r.open_ms,
      total_ms: r.total_ms,
      samples: r.samples,
      ok: r.ok,
      state: r.state,
      error: r.error,
    };
  });
