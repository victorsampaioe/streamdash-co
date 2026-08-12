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
    // Priorizamos os servidores que o usuário realment tem acesso.
    const { data: myServers } = await context.supabase
      .from("servers")
      .select("id, name");

    if (!myServers || myServers.length === 0) return { items: [] };
    const myServerIds = myServers.map(s => s.id);

    // 2. Busca por nome similar no catálogo
    // Usamos ilike no name E busca exata no title_key
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

    // 3. Agrupar por conteúdo (title_key + kind)
    // No diagnóstico, o usuário escolhe o CONTEÚDO primeiro, depois vê a lista de servidores.
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
      // Evita duplicar servidor se houver itens com nomes ligeiramente diferentes mas mesma key
      if (!entry.servers.some((s: any) => s.id === it.server_id)) {
        const srvName = myServers.find(s => s.id === it.server_id)?.name || "Servidor";
        entry.servers.push({
          id: it.server_id,
          name: srvName,
          external_id: it.external_id
        });
      }
    }

    return {
      items: Array.from(grouped.values())
    };
  });

/**
 * Retorna as temporadas de uma série específica em um servidor.
 */
export const getSeriesSeasons = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string, seriesId: string }) => z.object({
    serverId: z.string().uuid(),
    seriesId: z.string()
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Chamada ao Core AWS para buscar dados reais via Player API Xtream
    const { runOnCore } = await import("./core-api.server");
    const { getSeriesDataOnCore } = await import("./iptv.server");

    return await runOnCore(
      "get-series-seasons",
      data,
      () => getSeriesDataOnCore(data.serverId, data.seriesId)
    );
  });
