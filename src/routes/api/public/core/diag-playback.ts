// TEMPORÁRIO — diagnóstico real da cadeia de reprodução (filme + série).
// Executa: catálogo -> URL de mídia -> proxy /api/public/core/stream (com Range).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/core/diag-playback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return new Response("token required", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getPlayerCredentials, hostCandidates, buildXtreamCatalogUrl, maskUrl } = await import(
          "@/lib/player.server"
        );
        const { UA_PLAYER, UA_VLC } = await import("@/lib/iptv.server");

        const { data: session } = await supabaseAdmin
          .from("player_sessions")
          .select("id, server_id, xtream_user, xtream_pass, expires_at")
          .eq("token", token)
          .single();
        if (!session) return Response.json({ erro: "sessão não encontrada" }, { status: 404 });

        const { data: server } = await supabaseAdmin
          .from("servers")
          .select("host")
          .eq("id", session.server_id)
          .single();

        const creds = await getPlayerCredentials(session as any);
        const host = server!.host;
        const report: any = { host, usuario: creds.username, temSenha: !!creds.password, filme: {}, serie: {} };

        const api = async (action: string, extra?: any) => {
          const u = buildXtreamCatalogUrl(host, creds, { action, ...extra });
          const res = await fetch(u, { headers: { "user-agent": UA_PLAYER } });
          const text = await res.text();
          try {
            return { status: res.status, json: JSON.parse(text), endpoint: maskUrl(u) };
          } catch {
            return { status: res.status, json: null, amostra: text.slice(0, 200), endpoint: maskUrl(u) };
          }
        };

        const probe = async (target: string, range: string | null, ua: string) => {
          const h: Record<string, string> = { "User-Agent": ua, Accept: "*/*" };
          if (range) h["Range"] = range;
          try {
            const res = await fetch(target, { headers: h, redirect: "follow" });
            const buf = res.body ? new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0))) : null;
            return {
              url: maskUrl(target).replace(/\/\/[^/]+\/(live|movie|series)\/[^/]+\/[^/]+\//, "//***/$1/***/***/"),
              status: res.status,
              contentType: res.headers.get("content-type"),
              contentLength: res.headers.get("content-length"),
              contentRange: res.headers.get("content-range"),
              acceptRanges: res.headers.get("accept-ranges"),
              bytesRecebidos: buf ? buf.byteLength : 0,
              primeirosBytes: buf ? Array.from(buf.slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join(" ") : null,
              amostraTexto: buf && /text|json|mpegurl|html/i.test(res.headers.get("content-type") ?? "")
                ? new TextDecoder().decode(buf.slice(0, 300))
                : null,
            };
          } catch (e) {
            return { url: "erro", erro: String((e as Error).message) };
          }
        };

        // ---------- FILME ----------
        const vodCats = await api("get_vod_categories");
        const cat = Array.isArray(vodCats.json) ? vodCats.json[0] : null;
        const vods = cat ? await api("get_vod_streams", { categoryId: String(cat.category_id) }) : { json: [] as any };
        const movie = Array.isArray(vods.json) ? vods.json[0] : null;
        report.filme.catStatus = { status: vodCats.status, tipo: Array.isArray(vodCats.json) ? `array(${vodCats.json.length})` : typeof vodCats.json, amostra: (vodCats as any).amostra ?? JSON.stringify(vodCats.json)?.slice(0,200) };
        report.filme.vodStatus = { status: (vods as any).status, tipo: Array.isArray(vods.json) ? `array(${vods.json.length})` : typeof vods.json, amostra: (vods as any).amostra ?? JSON.stringify(vods.json)?.slice(0,200) };
        report.filme.item = movie
          ? { id: movie.stream_id, nome: movie.name, container: movie.container_extension }
          : null;

        if (movie) {
          const ext = movie.container_extension || "mp4";
          const base = hostCandidates(host)[0];
          const direto = `${base}/movie/${encodeURIComponent(creds.username!)}/${encodeURIComponent(creds.password!)}/${movie.stream_id}.${ext}`;
          report.filme.upstreamDireto = await probe(direto, "bytes=0-1023", UA_VLC);
          report.filme.proxy = await probe(
            `${url.origin}/api/public/core/stream?token=${token}&sid=${movie.stream_id}&ext=${ext}&type=movie`,
            "bytes=0-1023",
            UA_PLAYER
          );
          // o que o app realmente pede hoje (ext fixo mp4)
          report.filme.proxyExtFixoMp4 = await probe(
            `${url.origin}/api/public/core/stream?token=${token}&sid=${movie.stream_id}&ext=mp4&type=movie`,
            "bytes=0-1023",
            UA_PLAYER
          );
        }

        // ---------- SÉRIE ----------
        const serCats = await api("get_series_categories");
        const scat = Array.isArray(serCats.json) ? serCats.json[0] : null;
        const series = scat ? await api("get_series", { categoryId: String(scat.category_id) }) : { json: [] as any };
        const serie = Array.isArray(series.json) ? series.json[0] : null;
        report.serie.catStatus = { status: serCats.status, tipo: Array.isArray(serCats.json) ? `array(${serCats.json.length})` : typeof serCats.json, amostra: (serCats as any).amostra ?? JSON.stringify(serCats.json)?.slice(0,200) };
        report.serie.item = serie ? { id: serie.series_id, nome: serie.name } : null;

        if (serie) {
          const info = await api("get_series_info", { contentId: String(serie.series_id) });
          const seasons = info.json?.episodes ?? {};
          const firstSeason = Object.keys(seasons)[0];
          const ep = firstSeason ? seasons[firstSeason]?.[0] : null;
          report.serie.episodio = ep ? { id: ep.id, titulo: ep.title, container: ep.container_extension } : null;
          if (ep) {
            const ext = ep.container_extension || "mp4";
            const base = hostCandidates(host)[0];
            const direto = `${base}/series/${encodeURIComponent(creds.username!)}/${encodeURIComponent(creds.password!)}/${ep.id}.${ext}`;
            report.serie.upstreamDireto = await probe(direto, "bytes=0-1023", UA_VLC);
            report.serie.proxy = await probe(
              `${url.origin}/api/public/core/stream?token=${token}&sid=${ep.id}&ext=${ext}&type=series`,
              "bytes=0-1023",
              UA_PLAYER
            );
            report.serie.proxyExtFixoMp4 = await probe(
              `${url.origin}/api/public/core/stream?token=${token}&sid=${ep.id}&ext=mp4&type=series`,
              "bytes=0-1023",
              UA_PLAYER
            );
          }
        }

        return Response.json(report, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
