import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/core/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const sid = url.searchParams.get("sid");
        const ext = url.searchParams.get("ext") || "ts";
        const type = url.searchParams.get("type") || "live";

        if (!token || !sid) return new Response("Missing parameters", { status: 400 });

        // 1. Validar sessão
        const { data: session, error: sessionErr } = await supabaseAdmin
          .from("player_sessions")
          .select("id, server_id, token, expires_at, xtream_user, xtream_pass")
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (sessionErr || !session) return new Response("Unauthorized", { status: 401 });

        // 2. Obter credenciais e host do servidor
        const { data: server } = await supabaseAdmin
          .from("servers")
          .select("host")
          .eq("id", session.server_id)
          .single();

        if (!server) return new Response("Server not found", { status: 404 });

        const { getPlayerCredentials } = await import("@/lib/player.server");
        const creds = await getPlayerCredentials(session as any);

        // 3. Montar URL original do Xtream
        // Live: /live/user/pass/id.ts
        // Movie: /movie/user/pass/id.mp4 (ou ext)
        // Series: /series/user/pass/id.mp4
        const streamPath = type === "live" 
          ? `live/${creds.username}/${creds.password}/${sid}.${ext}`
          : `${type === 'movie' ? 'movie' : 'series'}/${creds.username}/${creds.password}/${sid}.${ext}`;
        
        const targetUrl = `http://${server.host}/${streamPath}`;

        // 4. Proxy com headers de Player
        const { UA_PLAYER } = await import("@/lib/iptv.server");
        
        try {
          const response = await fetch(targetUrl, {
            headers: { "User-Agent": UA_PLAYER }
          });

          if (!response.ok) {
            return new Response(`Upstream error: ${response.status}`, { status: response.status });
          }

          // Repassar stream com headers apropriados
          const newHeaders = new Headers();
          
          // Headers de cache e performance
          newHeaders.set("Access-Control-Allow-Origin", "*");
          newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
          newHeaders.set("Cache-Control", "no-cache");
          
          // Repassar Content-Type original ou forçar se necessário
          const contentType = response.headers.get("Content-Type");
          if (ext === "ts") {
            newHeaders.set("Content-Type", "video/mp2t");
          } else if (contentType) {
            newHeaders.set("Content-Type", contentType);
          }

          // Suporte a Range Requests (206 Partial Content) para Filmes/Séries
          const contentRange = response.headers.get("Content-Range");
          const contentLength = response.headers.get("Content-Length");
          const acceptRanges = response.headers.get("Accept-Ranges");
          
          if (contentRange) newHeaders.set("Content-Range", contentRange);
          if (contentLength) newHeaders.set("Content-Length", contentLength);
          if (acceptRanges) newHeaders.set("Accept-Ranges", acceptRanges);

          return new Response(response.body, {
            status: response.status,
            headers: newHeaders
          });
        } catch (e: any) {
          return new Response(`Proxy error: ${e.message}`, { status: 500 });
        }
      },
      OPTIONS: async () => {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*"
          }
        });
      }
    }
  }
});
