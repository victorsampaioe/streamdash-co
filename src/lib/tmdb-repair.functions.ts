import { createServerFn } from "@tanstack/react-start";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchDetail } from "./tmdb.server";

/** 
 * Rotina de reparação para atualizar capas e metadados TMDB de conteúdos já encontrados.
 */
export const repairTmdbPosters = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    // Busca itens sem poster ou com tmdb_id nulo no catálogo global
    const { data: items } = await supabaseAdmin
      .from("iptv_global_catalog")
      .select("id, tmdb_id, media_type, normalized_name")
      .or("poster_path.is.null,tmdb_id.is.null")
      .limit(50);

    if (!items || items.length === 0) return { repaired: 0, message: "Tudo em dia!" };

    let repaired = 0;
    for (const item of items) {
      try {
        const mediaType = item.media_type as "movie" | "tv";
        
        // Se não tem ID, tenta buscar pelo nome
        let tmdbId = item.tmdb_id;
        if (!tmdbId) {
          const { searchTmdb } = await import("./tmdb.server");
          const results = await searchTmdb(item.normalized_name);
          const match = results.find(r => r.media_type === mediaType);
          if (match) tmdbId = match.tmdb_id;
        }

        if (tmdbId) {
          const detail = await fetchDetail(mediaType, tmdbId);
          // Atualiza apenas os campos que existem na tabela
          await supabaseAdmin
            .from("iptv_global_catalog")
            .update({
              tmdb_id: tmdbId,
              poster_path: detail.poster_path
            } as any)
            .eq("id", item.id);
          repaired++;
        }
      } catch (e) {
        console.error(`[Repair] Erro no item ${item.id}:`, e);
      }
    }

    return { repaired, total: items.length };
  });
