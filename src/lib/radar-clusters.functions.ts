import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Diagnóstico de deduplicação (servidores físicos x servidores lógicos). */
export const getClusterDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("iptv_cluster_diagnostics");
    if (error) throw new Error(error.message);
    return data as Record<string, any>;
  });

/** Recalcula os servidores lógicos comparando sinais técnicos reais. */
export const rebuildClusters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("rebuild_iptv_clusters", {});
    if (error) throw new Error(error.message);
    return data as Record<string, any>;
  });

/** Remove vínculos redundantes (aliases do mesmo servidor lógico). */
export const pruneRedundantMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("prune_redundant_catalog_matches");
    if (error) throw new Error(error.message);
    return { removed: (data as number) ?? 0 };
  });
