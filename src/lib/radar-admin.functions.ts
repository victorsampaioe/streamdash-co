import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Apenas administradores podem gerenciar o Radar.");
}

/** Recalcula a disponibilidade de todo o catálogo baseado na tabela de matches. */
export const recalculateRadarAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    console.log("[radar-admin] Iniciando recálculo de disponibilidade...");
    const now = new Date().toISOString();

    // 1. Unificar TMDB IDs entre registros duplicados (mesmo nome/tipo)
    // Buscamos registros que têm TMDB_ID e aplicamos nos que não têm
    const { data: enrichmentData } = await supabaseAdmin
      .from("iptv_global_catalog")
      .select("normalized_name, media_type, tmdb_id, poster_path")
      .not("tmdb_id", "is", null);

    if (enrichmentData && enrichmentData.length > 0) {
      // Agrupar por nome + tipo para ter um mapa de referência
      const map = new Map<string, { id: number; poster: string }>();
      for (const row of enrichmentData) {
        map.set(`${row.media_type}:${row.normalized_name}`, { id: row.tmdb_id!, poster: row.poster_path! });
      }

      // Atualizar em chunks os registros sem TMDB ID que agora temos match
      const entries = Array.from(map.entries());
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        await Promise.all(chunk.map(async ([key, val]) => {
          const [media_type, normalized_name] = key.split(":");
          await supabaseAdmin
            .from("iptv_global_catalog")
            .update({ 
              tmdb_id: val.id, 
              poster_path: val.poster,
              tmdb_status: 'found'
            } as never)
            .eq("media_type", media_type)
            .eq("normalized_name", normalized_name)
            .is("tmdb_id", null);
        }));
      }
    }

    // 2. Recalcular contadores (BATCH)
    // Como a tabela pode ser grande, processamos em lotes de IDs do catálogo
    let from = 0;
    const batchSize = 1000;
    let totalUpdated = 0;

    for (;;) {
      const { data: catalogIds } = await supabaseAdmin
        .from("iptv_global_catalog")
        .select("id")
        .range(from, from + batchSize - 1)
        .order("id");

      if (!catalogIds || catalogIds.length === 0) break;

      await Promise.all(catalogIds.map(async (row: any) => {
        // Contar matches únicos para este item
        const { count } = await supabaseAdmin
          .from("iptv_catalog_matches")
          .select("*", { count: 'exact', head: true })
          .eq("catalog_id", row.id);
        
        // Buscar data mais recente
        const { data: latest } = await supabaseAdmin
          .from("iptv_catalog_matches")
          .select("detected_at")
          .eq("catalog_id", row.id)
          .order("detected_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (count !== null) {
          await supabaseAdmin
            .from("iptv_global_catalog")
            .update({ 
              servers_found_count: count,
              last_detected_at: latest?.detected_at || now
            } as never)
            .eq("id", row.id);
        }
      }));

      totalUpdated += catalogIds.length;
      from += batchSize;
      console.log(`[radar-admin] Processados ${totalUpdated} registros...`);
      if (catalogIds.length < batchSize) break;
    }

    return { success: true, total: totalUpdated };
  });
