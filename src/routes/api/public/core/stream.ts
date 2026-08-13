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
          .select("id, server_id, token, expires_at")
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

        const { getIptvCredentials } = await import("@/lib/iptv-credentials.server");
        const creds = await getIptvCredentials(session.server_id);

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
          const newHeaders = new Headers(response.headers);
          newHeaders.set("Access-Control-Allow-Origin", "*");
          newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
          
          // Se for .ts, alguns navegadores podem precisar de content-type específico
          if (ext === "ts") {
            newHeaders.set("Content-Type", "video/mp2t");
          }

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
