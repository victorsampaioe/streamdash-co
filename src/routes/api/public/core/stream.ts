import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

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

/* ------------------------------------------------------------------ */
/* Assinatura das URLs repassadas ao Core AWS (worker stateless)        */
/* O Core não tem banco: ele não consegue validar a sessão do player.   */
/* O Painel valida a sessão, resolve a URL real e assina (HMAC) o       */
/* repasse. O Core só aceita URLs assinadas e ainda válidas.            */
/* ------------------------------------------------------------------ */
function signUpstream(absUrl: string, exp: number): string {
  const secret = process.env.CRON_SECRET ?? "";
  return createHmac("sha256", secret).update(`${absUrl}|${exp}`).digest("hex");
}

function verifyUpstream(absUrl: string, exp: number, sig: string): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !sig) return false;
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = signUpstream(absUrl, exp);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
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

function maskMedia(url: string) {
  return url.replace(/\/\/([^/]+)\/(live|movie|series)\/[^/]+\/[^/]+\//, "//$1/$2/***/***/");
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
        const range = request.headers.get("range");

        const { UA_PLAYER, UA_VLC } = await import("@/lib/iptv.server");

        /* ---------------------------------------------------------- */
        /* MODO CORE (worker stateless): só serve URLs assinadas.      */
        /* Nunca toca o banco — é o que fazia esta rota devolver 500.  */
        /* ---------------------------------------------------------- */
        const sig = url.searchParams.get("sig");
        const exp = Number(url.searchParams.get("exp") ?? 0);
        if (sig && passthrough) {
          const abs = b64urlDecode(passthrough);
          if (!verifyUpstream(abs, exp, sig)) {
            return new Response("Assinatura inválida", { status: 403, headers: CORS });
          }
          const h: Record<string, string> = {
            "User-Agent": type === "live" ? UA_PLAYER : UA_VLC,
            Accept: "*/*",
          };
          if (range) h["Range"] = range;
          try {
            const res = await fetch(abs, { headers: h, redirect: "follow" });
            console.log(
              `[stream-proxy][worker] url=${maskMedia(abs)} status=${res.status} ct=${res.headers.get("content-type")} range=${range ?? "-"}`
            );
            const out = new Headers(CORS);
            for (const k of ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]) {
              const v = res.headers.get(k);
              if (v) out.set(k, v);
            }
            out.set("Cache-Control", "no-cache");
            return new Response(res.body, { status: res.status, headers: out });
          } catch (e) {
            return new Response(`Worker fetch error: ${(e as Error).message}`, { status: 502, headers: CORS });
          }
        }

        if (process.env.IS_CORE === "true") {
          // Worker sem banco: sem assinatura não há como validar a sessão.
          return new Response("Core worker exige URL assinada (u+exp+sig)", { status: 400, headers: CORS });
        }

        if (!token || (!sid && !passthrough)) {
          return new Response("Missing parameters", { status: 400, headers: CORS });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
          // Extensões alternativas: painéis Xtream servem mkv/mp4/ts conforme o container.
          const exts =
            type === "live" ? [ext] : [ext, ...["mp4", "mkv", "ts"].filter((e) => e !== ext)];
          candidates = hostCandidates(server.host).flatMap((base) => {
            const paths = exts.map((e) => `${folder}/${user}/${pass}/${sid}.${e}`);
            // Live sem pasta é aceito por vários painéis Xtream.
            if (type === "live") paths.push(`${user}/${pass}/${sid}`);
            return paths.map((p) => `${base}/${p}`);
          });
        }

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
              `[stream-proxy] tentativa url=${maskMedia(candidate)} status=${res.status} ct=${res.headers.get("content-type")} len=${res.headers.get("content-length") ?? "chunked"}`
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

        // 3b. Bloqueio de borda (Cloudflare/WAF responde 403 a IPs de datacenter):
        // repassa ao Core AWS, que usa o IP da EC2. Como o Core é stateless (sem
        // banco), enviamos a URL final já resolvida e assinada — nunca o token.
        if (!upstream && url.searchParams.get("via") !== "core") {
          const { coreApiUrl, isCoreInstance } = await import("@/lib/core-api.server");
          const base = coreApiUrl();
          if (base && !isCoreInstance() && process.env.CRON_SECRET) {
            const expires = Math.floor(Date.now() / 1000) + 300;
            for (const candidate of candidates) {
              const relay = new URL(`${base}/api/public/core/stream`);
              relay.searchParams.set("u", b64urlEncode(candidate));
              relay.searchParams.set("exp", String(expires));
              relay.searchParams.set("sig", signUpstream(candidate, expires));
              relay.searchParams.set("type", type);
              relay.searchParams.set("ext", ext);
              relay.searchParams.set("via", "core");
              try {
                const res = await fetch(relay.toString(), {
                  headers: range ? { Range: range } : {},
                  redirect: "follow",
                });
                console.log(
                  `[stream-proxy] relay core url=${maskMedia(candidate)} status=${res.status} ct=${res.headers.get("content-type")}`
                );
                if (res.ok || res.status === 206) {
                  upstream = res;
                  usedUrl = candidate;
                  break;
                }
                await res.body?.cancel();
                lastStatus = res.status;
              } catch (e) {
                console.warn(`[stream-proxy] relay core falhou: ${(e as Error).message}`);
              }
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
        const finalExt = (usedUrl.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? ext).toLowerCase();
        const out = new Headers(CORS);
        out.set("Cache-Control", "no-cache");
        out.set("Content-Type", contentTypeFor(finalExt, upstreamType));
        for (const h of ["Content-Range", "Content-Length", "Accept-Ranges"]) {
          const v = upstream.headers.get(h);
          if (v) out.set(h, v);
        }
        if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");

        console.log(
          `[stream-proxy] entregando type=${type} ext=${finalExt} status=${upstream.status} ct=${out.get("Content-Type")} range=${range ?? "-"} len=${out.get("Content-Length") ?? "stream"}`
        );

        return new Response(upstream.body, { status: upstream.status, headers: out });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
