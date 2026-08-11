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
      for (let i = 0; i < entries.length; i += 50) {
        const chunk = entries.slice(i, i + 50);
        await Promise.all(chunk.map(async ([key, val]) => {
          const parts = key.split(":");
          const media_type = parts[0];
          const normalized_name = parts.slice(1).join(":");
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
    // Processamos apenas itens que possuem matches para otimizar
    const { data: itemsWithMatches } = await supabaseAdmin
        .from("iptv_catalog_matches")
        .select("catalog_id");
    
    const uniqueCatalogIds = [...new Set((itemsWithMatches ?? []).map(m => m.catalog_id))];
    let totalUpdated = 0;

    const CHUNK_SIZE = 50;
    for (let i = 0; i < uniqueCatalogIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueCatalogIds.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(chunk.map(async (id) => {
        const { count } = await supabaseAdmin
          .from("iptv_catalog_matches")
          .select("*", { count: 'exact', head: true })
          .eq("catalog_id", id);
        
        const { data: latest } = await supabaseAdmin
          .from("iptv_catalog_matches")
          .select("detected_at")
          .eq("catalog_id", id)
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
            .eq("id", id);
        }
      }));

      totalUpdated += chunk.length;
      if (i % 500 === 0) console.log(`[radar-admin] Processados ${totalUpdated} registros...`);
    }

    // Resetar contadores para quem não tem match
    await supabaseAdmin
      .from("iptv_global_catalog")
      .update({ servers_found_count: 0 } as never)
      .not("id", "in", uniqueCatalogIds);

    return { success: true, total: totalUpdated };
  });
