import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { isBrowserPlayable, incompatibleReason } from "@/lib/playback-format";

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
  const e = ext.toLowerCase();
  if (e === "m3u8") return "application/vnd.apple.mpegurl";
  if (e === "ts") return "video/mp2t";
  if (e === "mp4") return "video/mp4";
  if (e === "mkv") return "video/x-matroska";
  if (e === "m4v") return "video/x-m4v";
  if (e === "avi") return "video/x-msvideo";
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
          
          console.log(
            `[STREAM REQUEST][worker] type=${type} ext=${ext} sig=${sig.slice(0, 8)}... exp=${new Date(exp * 1000).toISOString()} url=${maskMedia(abs)}`
          );

          if (!verifyUpstream(abs, exp, sig)) {
            console.error(`[STREAM RESPONSE][worker] status=403 error="Assinatura inválida ou expirada"`);
            return new Response("Assinatura inválida", { status: 403, headers: CORS });
          }
          
          const h: Record<string, string> = {
            "User-Agent": type === "live" ? UA_PLAYER : UA_VLC,
            Accept: "*/*",
          };
          if (range) h["Range"] = range;
          
          try {
            const res = await fetch(abs, { headers: h, redirect: "follow" });
            
            const out = new Headers(CORS);
            for (const k of ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]) {
              const v = res.headers.get(k);
              if (v) out.set(k, v);
            }
            out.set("Cache-Control", "no-cache");
            
            console.log(
              `[STREAM RESPONSE][worker] status=${res.status} ct=${out.get("Content-Type")} range=${range ?? "none"} len=${out.get("Content-Length") ?? "stream"}`
            );

            return new Response(res.body, { status: res.status, headers: out });
          } catch (e) {
            console.error(`[STREAM RESPONSE][worker] status=502 error="${(e as Error).message}"`);
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
          // Extensões alternativas: painéis Xtream servem mkv/mp4/ts conforme o
          // container. Priorizamos sempre containers reproduzíveis no navegador.
          const exts =
            type === "live"
              ? [ext]
              : [
                  ...[ext, "mp4", "ts"].filter((e, i, a) => isBrowserPlayable(e) && a.indexOf(e) === i),
                  ...[ext, "mkv"].filter((e, i, a) => !isBrowserPlayable(e) && a.indexOf(e) === i),
                ];
          candidates = hostCandidates(server.host).flatMap((base) => {
            const paths = exts.map((e) => `${folder}/${user}/${pass}/${sid}.${e}`);
            // Live sem pasta é aceito por vários painéis Xtream.
            if (type === "live") paths.push(`${user}/${pass}/${sid}`);
            return paths.map((p) => `${base}/${p}`);
          });
        }

        // Evita tentativas longas: no máximo 6 candidatos e timeout por tentativa.
        candidates = candidates.slice(0, 6);

        const headers: Record<string, string> = {
          "User-Agent": passthrough || type === "live" ? UA_PLAYER : UA_VLC,
          Accept: "*/*",
        };
        if (range) headers["Range"] = range;

        let upstream: Response | null = null;
        let usedUrl = "";
        let lastStatus = 0;
        let deliveredVia: "core" | "panel" = "panel";
        let blockedDirect = false;

        const attemptDirect = async () => {
          for (const candidate of candidates) {
            try {
              const res = await fetch(candidate, {
                headers,
                redirect: "follow",
                signal: AbortSignal.timeout(15000),
              });
              lastStatus = res.status;
              console.log(
                `[stream-proxy][panel] tentativa url=${maskMedia(candidate)} status=${res.status} ct=${res.headers.get("content-type")} len=${res.headers.get("content-length") ?? "chunked"}`
              );
              if (res.ok || res.status === 206) {
                upstream = res;
                usedUrl = res.url || candidate;
                deliveredVia = "panel";
                return;
              }
              if (res.status === 403) blockedDirect = true;
              await res.body?.cancel();
            } catch (e) {
              console.warn(`[stream-proxy][panel] falha de rede: ${(e as Error).message}`);
            }
          }
        };

        // CAMADA PRINCIPAL: Cliente -> Painel -> Core AWS -> IPTV.
        // O Core é stateless: recebe a URL final já resolvida e assinada (HMAC),
        // nunca o token da sessão, e trata headers/CORS/timeout/Range.
        const attemptCore = async () => {
          if (url.searchParams.get("via") === "core") return;
          const { coreApiUrl, isCoreInstance } = await import("@/lib/core-api.server");
          const base = coreApiUrl();
          if (!base || isCoreInstance() || !process.env.CRON_SECRET) return;
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
                signal: AbortSignal.timeout(15000),
              });
              console.log(
                `[stream-proxy][core] url=${maskMedia(candidate)} status=${res.status} ct=${res.headers.get("content-type")}`
              );
              if (res.ok || res.status === 206) {
                upstream = res;
                usedUrl = candidate;
                deliveredVia = "core";
                return;
              }
              await res.body?.cancel();
              lastStatus = res.status;
            } catch (e) {
              console.warn(`[stream-proxy][core] relay falhou: ${(e as Error).message}`);
            }
          }
        };

        // Fluxo inteligente: Core primeiro; se ele não conseguir entregar,
        // uma única passagem direta pelo Painel — sem loops demorados.
        await attemptCore();
        if (!upstream) await attemptDirect();


        const found = upstream as Response | null;

        if (!found) {
          const reason = blockedDirect
            ? "Servidor bloqueou o acesso direto e o Core também não conseguiu entregar o stream."
            : `Servidor não entregou o stream (HTTP ${lastStatus || "sem resposta"}).`;
          console.error(`[STREAM RESPONSE][${deliveredVia}] status=${lastStatus || 502} reason="${reason}"`);
          return new Response(reason, {
            status: lastStatus || 502,
            headers: { ...CORS, "X-Playback-Reason": reason, "X-Playback-Via": deliveredVia },
          });
        }

        const upstreamType = found.headers.get("Content-Type");
        const isManifest =
          /mpegurl|m3u/i.test(upstreamType ?? "") || /\.m3u8(\?|$)/i.test(usedUrl);

        // 4a. Manifesto HLS → reescreve segmentos para o proxy
        if (isManifest) {
          const text = await found.text();
          const rewritten = rewriteManifest(text, usedUrl, token);
          console.log(`[stream-proxy] manifesto HLS reescrito bytes=${text.length} linhas=${text.split("\n").length} via=${deliveredVia}`);
          return new Response(rewritten, {
            status: 200,
            headers: {
              ...CORS,
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-cache",
              "X-Playback-Via": deliveredVia,
            },
          });
        }

        // 4b. Mídia binária (ts / mp4 / mkv) → repassa com suporte a Range
        const finalExt = (usedUrl.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? ext).toLowerCase();

        // Container que o navegador não decodifica: não entregar bytes que
        // resultariam em tela preta — devolver o motivo real.
        if (type !== "live" && !isBrowserPlayable(finalExt)) {
          const reason = incompatibleReason(finalExt);
          await found.body?.cancel();
          console.warn(`[STREAM RESPONSE][${deliveredVia}] status=415 ext=${finalExt} reason="${reason}"`);
          return new Response(reason, {
            status: 415,
            headers: {
              ...CORS,
              "Content-Type": "text/plain; charset=utf-8",
              "X-Playback-Reason": reason,
              "X-Playback-Incompatible": finalExt,
              "X-Playback-Via": deliveredVia,
            },
          });
        }

        const out = new Headers(CORS);
        out.set("Cache-Control", "no-cache");
        out.set("Content-Type", contentTypeFor(finalExt, upstreamType));
        out.set("X-Playback-Via", deliveredVia);
        for (const h of ["Content-Range", "Content-Length", "Accept-Ranges"]) {
          const v = found.headers.get(h);
          if (v) out.set(h, v);
        }
        if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");

        console.log(
          `[STREAM RESPONSE][${deliveredVia}] type=${type} ext=${finalExt} status=${found.status} ct=${out.get("Content-Type")} range=${range ?? "none"} len=${out.get("Content-Length") ?? "stream"}`
        );

        return new Response(found.body, { status: found.status, headers: out });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
