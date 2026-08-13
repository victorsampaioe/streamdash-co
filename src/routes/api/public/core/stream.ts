import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

function b64urlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
function b64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function contentTypeFor(ext: string, upstream: string | null) {
  if (ext === "m3u8") return "application/vnd.apple.mpegurl";
  if (ext === "ts") return "video/mp2t";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mkv") return "video/x-matroska";
  return upstream ?? "application/octet-stream";
}

/** Reescreve as URLs internas de um manifesto HLS para passarem pelo proxy. */
function rewriteManifest(manifest: string, upstreamUrl: string, token: string) {
  const baseUrl = new URL(upstreamUrl);
  const toProxy = (raw: string) => {
    const abs = new URL(raw, baseUrl).toString();
    return `/api/public/core/stream?token=${token}&u=${b64urlEncode(abs)}`;
  };
  return manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toProxy(uri)}"`);
      }
      return toProxy(trimmed);
    })
    .join("\n");
}

export const Route = createFileRoute("/api/public/core/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const sid = url.searchParams.get("sid");
        const passthrough = url.searchParams.get("u");
        const ext = (url.searchParams.get("ext") || "ts").toLowerCase();
        const type = url.searchParams.get("type") || "live";

        if (!token || (!sid && !passthrough)) {
          return new Response("Missing parameters", { status: 400, headers: CORS });
        }

        // 1. Validar sessão
        const { data: session, error: sessionErr } = await supabaseAdmin
          .from("player_sessions")
          .select("id, server_id, token, expires_at, xtream_user, xtream_pass")
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (sessionErr || !session) return new Response("Unauthorized", { status: 401, headers: CORS });

        // 2. Host do servidor
        const { data: server } = await supabaseAdmin
          .from("servers")
          .select("host")
          .eq("id", session.server_id)
          .single();

        if (!server) return new Response("Server not found", { status: 404, headers: CORS });

        const { getPlayerCredentials, hostCandidates } = await import("@/lib/player.server");
        const { UA_PLAYER, UA_VLC } = await import("@/lib/iptv.server");

        // 3. Montar a lista de URLs candidatas
        let candidates: string[];
        if (passthrough) {
          // Segmento/manifesto interno (HLS): só permitimos o mesmo host do servidor.
          const abs = b64urlDecode(passthrough);
          const allowed = hostCandidates(server.host).map((c) => new URL(c).hostname);
          if (!allowed.includes(new URL(abs).hostname)) {
            return new Response("Forbidden host", { status: 403, headers: CORS });
          }
          candidates = [abs];
        } else {
          const creds = await getPlayerCredentials(session as any);
          if (!creds.username || !creds.password) {
            return new Response("Credenciais indisponíveis", { status: 401, headers: CORS });
          }
          const folder = type === "live" ? "live" : type === "movie" ? "movie" : "series";
          const user = encodeURIComponent(creds.username);
          const pass = encodeURIComponent(creds.password);
          candidates = hostCandidates(server.host).flatMap((base) => {
            const paths = [`${folder}/${user}/${pass}/${sid}.${ext}`];
            // Live sem pasta é aceito por vários painéis Xtream.
            if (type === "live") paths.push(`${user}/${pass}/${sid}`);
            return paths.map((p) => `${base}/${p}`);
          });
        }

        const range = request.headers.get("range");
        const headers: Record<string, string> = {
          "User-Agent": passthrough || type === "live" ? UA_PLAYER : UA_VLC,
          Accept: "*/*",
        };
        if (range) headers["Range"] = range;

        let upstream: Response | null = null;
        let usedUrl = "";
        let lastStatus = 0;

        for (const candidate of candidates) {
          try {
            const res = await fetch(candidate, { headers, redirect: "follow" });
            lastStatus = res.status;
            console.log(
              `[stream-proxy] tentativa url=${candidate.replace(/\/\/[^/]+\/[^/]+\/[^/]+\/[^/]+\//, "//***/")} status=${res.status} ct=${res.headers.get("content-type")} len=${res.headers.get("content-length") ?? "chunked"}`
            );
            if (res.ok || res.status === 206) {
              upstream = res;
              usedUrl = res.url || candidate;
              break;
            }
            await res.body?.cancel();
          } catch (e) {
            console.warn(`[stream-proxy] falha de rede: ${(e as Error).message}`);
          }
        }

        // 3b. Bloqueio de borda (Cloudflare/WAF costuma responder 403 a IPs de
        // datacenter): repassa a requisição ao Core AWS, que usa o IP da EC2.
        if (!upstream && url.searchParams.get("via") !== "core") {
          const { coreApiUrl, isCoreInstance } = await import("@/lib/core-api.server");
          const base = coreApiUrl();
          if (base && !isCoreInstance()) {
            const relay = new URL(`${base}/api/public/core/stream`);
            url.searchParams.forEach((v, k) => relay.searchParams.set(k, v));
            relay.searchParams.set("via", "core");
            try {
              const res = await fetch(relay.toString(), {
                headers: range ? { Range: range } : {},
                redirect: "follow",
              });
              console.log(`[stream-proxy] relay core status=${res.status} ct=${res.headers.get("content-type")}`);
              if (res.ok || res.status === 206) {
                const out = new Headers(CORS);
                for (const h of ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]) {
                  const v = res.headers.get(h);
                  if (v) out.set(h, v);
                }
                out.set("Cache-Control", "no-cache");
                return new Response(res.body, { status: res.status, headers: out });
              }
              await res.body?.cancel();
              lastStatus = lastStatus || res.status;
            } catch (e) {
              console.warn(`[stream-proxy] relay core falhou: ${(e as Error).message}`);
            }
          }
        }

        if (!upstream) {
          return new Response(`Upstream error: ${lastStatus || "sem resposta"}`, {
            status: lastStatus || 502,
            headers: CORS,
          });
        }


        const upstreamType = upstream.headers.get("Content-Type");
        const isManifest =
          /mpegurl|m3u/i.test(upstreamType ?? "") || /\.m3u8(\?|$)/i.test(usedUrl);

        // 4a. Manifesto HLS → reescreve segmentos para o proxy
        if (isManifest) {
          const text = await upstream.text();
          const rewritten = rewriteManifest(text, usedUrl, token);
          console.log(`[stream-proxy] manifesto HLS reescrito bytes=${text.length} linhas=${text.split("\n").length}`);
          return new Response(rewritten, {
            status: 200,
            headers: {
              ...CORS,
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-cache",
            },
          });
        }

        // 4b. Mídia binária (ts / mp4 / mkv) → repassa com suporte a Range
        const out = new Headers(CORS);
        out.set("Cache-Control", "no-cache");
        out.set("Content-Type", contentTypeFor(ext, upstreamType));
        for (const h of ["Content-Range", "Content-Length", "Accept-Ranges"]) {
          const v = upstream.headers.get(h);
          if (v) out.set(h, v);
        }
        if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");

        console.log(
          `[stream-proxy] entregando type=${type} ext=${ext} status=${upstream.status} ct=${out.get("Content-Type")} range=${range ?? "-"} len=${out.get("Content-Length") ?? "stream"}`
        );

        return new Response(upstream.body, { status: upstream.status, headers: out });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
