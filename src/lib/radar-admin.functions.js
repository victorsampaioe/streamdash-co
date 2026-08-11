import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
async function assertAdmin(context) {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
    });
    if (!isAdmin)
        throw new Error("Apenas administradores podem gerenciar o Radar.");
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
        const map = new Map();
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
                })
                    .eq("media_type", media_type)
                    .eq("normalized_name", normalized_name)
                    .is("tmdb_id", null);
            }));
        }
    }
    // 2. Recalcular contadores (BATCH)
    const { data: itemsWithMatches } = await supabaseAdmin
        .from("iptv_catalog_matches")
        .select("catalog_id");
    const uniqueIds = (itemsWithMatches ?? []).map(m => m.catalog_id).filter((id) => !!id);
    const uniqueCatalogIds = [...new Set(uniqueIds)];
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
                })
                    .eq("id", id);
            }
        }));
        totalUpdated += chunk.length;
        if (i % 500 === 0)
            console.log(`[radar-admin] Processados ${totalUpdated} registros...`);
    }
    // Resetar contadores para quem não tem match
    if (uniqueCatalogIds.length > 0) {
        await supabaseAdmin
            .from("iptv_global_catalog")
            .update({ servers_found_count: 0 })
            .not("id", "in", uniqueCatalogIds);
    }
    else {
        await supabaseAdmin
            .from("iptv_global_catalog")
            .update({ servers_found_count: 0 });
    }
    return { success: true, total: totalUpdated };
});
/**
 * Teste manual de busca específica no Radar IPTV
 */
export const searchRadarTitleManual = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({ title: z.string().min(2) }).parse(d))
    .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { title } = data;
    const { titleKey } = await import("./iptv-catalog.server");
    const tKey = titleKey(title);
    console.log(`[radar-admin] Busca manual solicitada: "${title}" (key: ${tKey})`);
    // 1. Identificar servidores elegíveis (ativos + credenciais)
    const { eligibleRadarServerIds } = await import("./radar-jobs.server");
    const serverIds = await eligibleRadarServerIds();
    if (!serverIds.length) {
        return {
            found: false,
            message: "Nenhum servidor elegível encontrado para o teste.",
            checked_at: new Date().toISOString()
        };
    }
    // 2. Localizar o item no catálogo global
    const { data: globalItem } = await supabaseAdmin
        .from("iptv_global_catalog")
        .select("id, normalized_name, media_type")
        .eq("title_key", tKey)
        .maybeSingle();
    const serversFound = [];
    const now = new Date().toISOString();
    // 3. Executar busca rápida em paralelo
    const BATCH_SIZE = 5;
    for (let i = 0; i < serverIds.length; i += BATCH_SIZE) {
        const batch = serverIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (sid) => {
            try {
                const { data: srv } = await supabaseAdmin.from("servers").select("name, host").eq("id", sid).single();
                const { getIptvCredentials } = await import("./iptv-credentials.server");
                const cred = await getIptvCredentials(sid);
                if (!cred.username || !cred.password)
                    return;
                const { probeXtream } = await import("./iptv.server");
                const x = await probeXtream(srv.host, cred.username, cred.password, { catalogMode: "vod" });
                if (!x.login_ok)
                    return;
                const allItems = [...x.catalog.vod, ...x.catalog.series];
                const match = allItems.find(it => titleKey(it.name) === tKey);
                if (match) {
                    serversFound.push(srv.name);
                    if (globalItem) {
                        await supabaseAdmin.from("iptv_catalog_matches").upsert({
                            catalog_id: globalItem.id,
                            server_id: sid,
                            external_id: String(match.id),
                            raw_name: match.name,
                            detected_at: now
                        }, { onConflict: 'catalog_id,server_id' });
                    }
                }
            }
            catch (e) {
                console.error(`[radar-manual] Erro no servidor ${sid}:`, e);
            }
        }));
    }
    // 4. Se não tínhamos o globalItem mas encontramos em algum servidor, criamos agora
    if (!globalItem && serversFound.length > 0) {
        await supabaseAdmin
            .from("iptv_global_catalog")
            .insert({
            title_key: tKey,
            media_type: 'movie',
            normalized_name: title,
            first_server_id: serverIds[0],
            first_detected_at: now,
            last_detected_at: now,
            tmdb_status: 'pending'
        });
    }
    return {
        title: title,
        found: serversFound.length > 0,
        server_count: serversFound.length,
        servers: serversFound,
        checked_at: now
    };
});
