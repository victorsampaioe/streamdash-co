import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { titleKey } from "./iptv-catalog.server";

/**
 * Busca unificada no catálogo para o Diagnóstico de Conteúdo.
 * Retorna Canais, Filmes e Séries/Episódios encontrados nos servidores do usuário.
 */
export const searchDiagnosticContent = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { term: string }) => z.object({ term: z.string().min(2) }).parse(d))
  .handler(async ({ data, context }) => {
    const { term } = data;
    const tKey = titleKey(term);

    // 1. Busca no iptv_catalog_items os servidores do usuário que possuem o termo
    const { data: myServers } = await context.supabase
      .from("servers")
      .select("id, name");

    if (!myServers || myServers.length === 0) return { items: [], total: 0, truncated: false };
    const myServerIds = myServers.map(s => s.id);

    // 2. Busca por nome similar no catálogo
    const { data: items, error } = await context.supabase
      .from("iptv_catalog_items")
      .select(`
        kind,
        external_id,
        name,
        category,
        title_key,
        server_id
      `)
      .in("server_id", myServerIds)
      .is("removed_at", null)
      .or(`name.ilike.%${term}%,title_key.eq.${tKey}`)
      .limit(100);

    if (error) throw error;

    // Item 7 — total real para indicar corte em 100 resultados
    const { count: totalCount } = await context.supabase
      .from("iptv_catalog_items")
      .select("id", { count: "exact", head: true })
      .in("server_id", myServerIds)
      .is("removed_at", null)
      .or(`name.ilike.%${term}%,title_key.eq.${tKey}`);

    // 3. Agrupar por conteúdo (title_key + kind)
    const grouped = new Map<string, any>();

    for (const it of items || []) {
      const key = `${it.kind}:${it.title_key}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          title: it.name,
          title_key: it.title_key,
          kind: it.kind, // live, vod, series
          category: it.category,
          media_type: it.kind === 'live' ? 'live' : (it.kind === 'series' ? 'series' : 'movie'),
          servers: []
        });
      }
      
      const entry = grouped.get(key);
      if (!entry.servers.some((s: any) => s.id === it.server_id)) {
        const srvName = myServers.find(s => s.id === it.server_id)?.name || "Servidor";
        entry.servers.push({
          id: it.server_id,
          name: srvName,
          external_id: it.external_id
        });
      }
    }

    // Item 7 — resolve o ID numérico de categoria para o nome legível
    const involvedServers = Array.from(new Set((items || []).map((i: any) => i.server_id))).slice(0, 3);
    const catNames: Record<string, string> = {};
    if (involvedServers.length) {
      const { runOnCore } = await import("./core-api.server");
      const { getCategoryNames } = await import("./diagnostics-categories.server");
      const maps = await Promise.allSettled(
        involvedServers.map((sid) =>
          runOnCore("iptv-categories", { serverId: sid }, () => getCategoryNames(sid as string)),
        ),
      );
      for (const m of maps) {
        if (m.status === "fulfilled" && m.value) Object.assign(catNames, m.value as Record<string, string>);
      }
    }

    const list = Array.from(grouped.values()).map((entry: any) => ({
      ...entry,
      category: entry.category ? (catNames[String(entry.category)] ?? (/^\d+$/.test(String(entry.category)) ? null : entry.category)) : null,
    }));

    return {
      items: list,
      total: totalCount ?? list.length,
      truncated: (items?.length ?? 0) >= 100,
    };
  });

/**
 * Retorna as temporadas de uma série específica em um servidor.
 */
export const getSeriesSeasons = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string, seriesId: string, seasonNum?: number }) => z.object({
    serverId: z.string().uuid(),
    seriesId: z.string(),
    seasonNum: z.number().optional()
  }).parse(d))
  .handler(async ({ data, context }): Promise<any> => {
    const { runOnCore } = await import("./core-api.server");
    const { getSeriesDataOnCore } = await import("./iptv.server");

    try {
      return await runOnCore(
        "get-series-seasons",
        { serverId: data.serverId, seriesId: data.seriesId, seasonNum: data.seasonNum },
        () => getSeriesDataOnCore(data.serverId, data.seriesId, data.seasonNum)
      );
    } catch (e: any) {
      console.error("[getSeriesSeasons] Error:", e);
      // Se for um erro 404 do core, passamos uma mensagem amigável
      if (String(e.message).includes("404")) {
        throw new Error("IPTV API Error: 404 (Série não encontrada no servidor)");
      }
      throw e;
    }
  });
