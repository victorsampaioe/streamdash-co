import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
    const { data: enrichmentData } = await supabaseAdmin
      .from("iptv_global_catalog")
      .select("normalized_name, media_type, tmdb_id, poster_path")
      .not("tmdb_id", "is", null);

    if (enrichmentData && enrichmentData.length > 0) {
      const map = new Map<string, { id: number; poster: string }>();
      for (const row of enrichmentData) {
        if (row.tmdb_id && row.poster_path) {
          map.set(`${row.media_type}:${row.normalized_name}`, { id: row.tmdb_id, poster: row.poster_path });
        }
      }

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

    // 2. Recalcular contadores por SERVIDOR LÓGICO (aliases do mesmo cluster contam como 1)
    const { data: updated, error: recalcErr } = await (context.supabase as any).rpc(
      "recalc_iptv_availability",
    );
    if (recalcErr) throw new Error(recalcErr.message);

    return { success: true, total: (updated as number) ?? 0 };
  });

/**
 * Teste manual de busca no Radar IPTV.
 *
 * Consulta o catálogo já coletado dos servidores (iptv_catalog_items), que é
 * atualizado pelo job de sincronização. É instantâneo e não sobrecarrega os
 * servidores IPTV — além de revalidar os vínculos de disponibilidade.
 */
export const searchRadarTitleManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string }) => z.object({ title: z.string().min(2) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { title } = data;
    const { titleKey } = await import("./iptv-catalog.server");
    const tKey = titleKey(title);
    const now = new Date().toISOString();

    console.log(`[radar-admin] Busca manual: "${title}" (key: ${tKey})`);

    // 1. Itens encontrados nos catálogos coletados
    const { data: items, error } = await supabaseAdmin
      .from("iptv_catalog_items")
      .select("server_id, kind, external_id, name, title_key, last_seen_at")
      .eq("title_key", tKey)
      .is("removed_at", null)
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = (items ?? []) as {
      server_id: string;
      kind: string;
      external_id: string;
      name: string;
      title_key: string;
      last_seen_at: string;
    }[];

    // 2. Nomes reais dos servidores + servidor lógico (cluster)
    const serverIds = [...new Set(rows.map((r) => r.server_id))];
    const nameById = new Map<string, string>();
    const clusterByServer = new Map<string, { id: string; name: string }>();
    if (serverIds.length) {
      const { data: srvs } = await supabaseAdmin.from("servers").select("id, name").in("id", serverIds);
      for (const s of (srvs ?? []) as { id: string; name: string }[]) nameById.set(s.id, s.name);

      const { data: mem } = await supabaseAdmin
        .from("iptv_cluster_members")
        .select("server_id, cluster_id")
        .in("server_id", serverIds);
      const clusterIds = [...new Set(((mem ?? []) as any[]).map((m) => m.cluster_id as string))];
      if (clusterIds.length) {
        const { data: cls } = await supabaseAdmin
          .from("iptv_server_clusters")
          .select("id, name")
          .in("id", clusterIds);
        const clName = new Map(((cls ?? []) as any[]).map((c) => [c.id as string, c.name as string]));
        for (const m of (mem ?? []) as any[]) {
          clusterByServer.set(m.server_id as string, {
            id: m.cluster_id as string,
            name: clName.get(m.cluster_id as string) ?? "Servidor",
          });
        }
      }
    }

    // 3. Revalidar/registrar o vínculo no catálogo global
    for (const kind of ["vod", "series"] as const) {
      const kindRows = rows.filter((r) => r.kind === kind);
      if (!kindRows.length) continue;
      const mediaType = kind === "series" ? "tv" : "movie";

      let { data: globalItem } = await supabaseAdmin
        .from("iptv_global_catalog")
        .select("id")
        .eq("title_key", tKey)
        .eq("media_type", mediaType)
        .maybeSingle();

      if (!globalItem) {
        const { data: created } = await supabaseAdmin
          .from("iptv_global_catalog")
          .insert({
            title_key: tKey,
            media_type: mediaType,
            normalized_name: kindRows[0]!.name,
            first_server_id: kindRows[0]!.server_id,
            first_detected_at: now,
            last_detected_at: now,
            tmdb_status: "pending",
          } as never)
          .select("id")
          .maybeSingle();
        globalItem = created as any;
      }

      if (globalItem) {
        const seen = new Set<string>();
        const matches = kindRows
          .filter((r) => !seen.has(r.server_id) && seen.add(r.server_id))
          .map((r) => ({
            catalog_id: (globalItem as any).id,
            server_id: r.server_id,
            external_id: r.external_id,
            raw_name: r.name,
            detected_at: now,
          }));
        await supabaseAdmin
          .from("iptv_catalog_matches")
          .upsert(matches as never, { onConflict: "catalog_id,server_id" });
        await supabaseAdmin
          .from("iptv_global_catalog")
          .update({ servers_found_count: matches.length, last_detected_at: now } as never)
          .eq("id", (globalItem as any).id);
      }
    }

    // 4. Sugestões quando não houver correspondência exata
    let suggestions: string[] = [];
    if (!rows.length) {
      const { data: like } = await supabaseAdmin
        .from("iptv_catalog_items")
        .select("name")
        .ilike("name", `%${title.replace(/\((\d{4})\)/, "").trim()}%`)
        .is("removed_at", null)
        .limit(20);
      suggestions = [...new Set(((like ?? []) as { name: string }[]).map((r) => r.name))].slice(0, 10);
    }

    const servers = [...new Set(rows.map((r) => nameById.get(r.server_id) ?? "Servidor"))];

    return {
      title,
      title_key: tKey,
      found: servers.length > 0,
      media_type: rows[0]?.kind === "series" ? "Série" : rows.length ? "Filme" : null,
      server_count: servers.length,
      servers,
      suggestions,
      checked_at: now,
    };
  });

