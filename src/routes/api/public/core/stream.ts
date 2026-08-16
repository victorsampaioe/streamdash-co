import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { isBrowserPlayable, incompatibleReason } from "@/lib/playback-format";
import { CORE_STREAM_VERSION } from "@/lib/core-version";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Playback-Via, X-Playback-Reason, X-Playback-Incompatible, X-Core-Error, X-Core-Status, X-Core-Stream-Version, X-Core-Worker-Version",
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
        const expRaw = url.searchParams.get("exp");
        const exp = Number(expRaw ?? 0);
        const isCore = process.env.IS_CORE === "true";
        const viaCore = url.searchParams.get("via") === "core";
        const VER = { "X-Core-Stream-Version": CORE_STREAM_VERSION };

        /** 400 nunca genérico: sempre com o motivo real. */
        const badRequest = (motivo: string, detalhe: Record<string, unknown>) => {
          console.error(
            `[CORE REQUEST] status=400 erro="${motivo}" payload_valido=false assinatura=${sig ? "presente" : "ausente"} ${JSON.stringify(detalhe)}`
          );
          return new Response(motivo, {
            status: 400,
            headers: { ...CORS, ...VER, "X-Core-Error": motivo },
          });
        };

        if (isCore || viaCore || sig || expRaw) {
          // Requisição destinada ao worker: exige u + exp + sig válidos.
          if (!passthrough) return badRequest("Parâmetro 'u' (URL assinada em base64url) ausente", { type, ext });
          if (!expRaw) return badRequest("Parâmetro 'exp' ausente", { type, ext });
          if (!Number.isFinite(exp) || exp <= 0) return badRequest("Parâmetro 'exp' inválido", { exp: expRaw });
          if (!sig) return badRequest("Parâmetro 'sig' (HMAC) ausente", { exp });
          if (!process.env.CRON_SECRET)
            return new Response("Worker sem CRON_SECRET configurado", {
              status: 500,
              headers: { ...CORS, ...VER, "X-Core-Error": "CRON_SECRET ausente" },
            });

          let abs: string;
          try {
            abs = b64urlDecode(passthrough);
            new URL(abs);
          } catch {
            return badRequest("Parâmetro 'u' não é uma URL base64url válida", {});
          }

          console.log(
            `[CORE REQUEST] status=recebido payload_valido=true assinatura=${sig.slice(0, 8)}... type=${type} ext=${ext} exp=${new Date(exp * 1000).toISOString()} range=${range ?? "none"} url=${maskMedia(abs)}`
          );

          if (exp * 1000 < Date.now()) {
            console.error(`[CORE REQUEST] status=403 erro="URL assinada expirada"`);
            return new Response("URL assinada expirada", {
              status: 403,
              headers: { ...CORS, ...VER, "X-Core-Error": "exp expirado" },
            });
          }
          if (!verifyUpstream(abs, exp, sig)) {
            console.error(`[CORE REQUEST] status=403 erro="Assinatura HMAC inválida"`);
            return new Response("Assinatura inválida", {
              status: 403,
              headers: { ...CORS, ...VER, "X-Core-Error": "assinatura inválida" },
            });
          }

          const origin = new URL(abs).origin;
          const h: Record<string, string> = {
            "User-Agent": type === "live" ? UA_PLAYER : UA_VLC,
            Accept:
              ext === "m3u8"
                ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
                : "*/*",
            "Accept-Encoding": "identity",
            Connection: "keep-alive",
            Referer: `${origin}/`,
            Origin: origin,
          };
          if (range) h["Range"] = range;

          const t0 = Date.now();
          try {
            const res = await fetch(abs, {
              headers: h,
              redirect: "follow",
              signal: AbortSignal.timeout(20000),
            });

            const out = new Headers({ ...CORS, ...VER });
            for (const k of ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]) {
              const v = res.headers.get(k);
              if (v) out.set(k, v);
            }
            if (!out.has("Content-Type")) out.set("Content-Type", contentTypeFor(ext, null));
            if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");
            out.set("Cache-Control", "no-cache");
            out.set("X-Upstream-Status", String(res.status));

            console.log(
              `[UPSTREAM IPTV] url=${maskMedia(abs)} status=${res.status} content-type=${res.headers.get("content-type") ?? "-"} range=${range ?? "none"} content-range=${res.headers.get("content-range") ?? "-"} tempo=${Date.now() - t0}ms erro=-`
            );

            if (!res.ok && res.status !== 206) {
              await res.body?.cancel();
              const motivo = `Origem IPTV respondeu HTTP ${res.status}`;
              out.set("X-Playback-Reason", motivo);
              out.set("Content-Type", "text/plain; charset=utf-8");
              return new Response(motivo, { status: res.status, headers: out });
            }

            return new Response(res.body, { status: res.status, headers: out });
          } catch (e) {
            const msg = (e as Error).message;
            console.error(
              `[UPSTREAM IPTV] url=${maskMedia(abs)} status=502 content-type=- range=${range ?? "none"} tempo=${Date.now() - t0}ms erro="${msg}"`
            );
            return new Response(`Worker fetch error: ${msg}`, {
              status: 502,
              headers: { ...CORS, ...VER, "X-Core-Error": msg },
            });
          }
        }

        if (!token || (!sid && !passthrough)) {
          return badRequest(
            !token ? "Token de sessão ausente" : "Informe 'sid' (conteúdo) ou 'u' (URL interna do HLS)",
            { token: Boolean(token), sid, passthrough: Boolean(passthrough) }
          );
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
        // Modo validação: força a entrega pelo Core, sem fallback silencioso.
        const forceCore = url.searchParams.get("forceCore") === "1";
        const coreDiag: {
          tentado: boolean;
          motivo: string | null;
          status: number | null;
          workerVersion: string | null;
        } = { tentado: false, motivo: null, status: null, workerVersion: null };

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
          if (!base) { coreDiag.motivo = "CORE_API_URL não configurada no Painel"; return; }
          if (isCoreInstance()) { coreDiag.motivo = "Esta instância é o próprio Core"; return; }
          if (!process.env.CRON_SECRET) { coreDiag.motivo = "CRON_SECRET ausente no Painel (não é possível assinar)"; return; }
          coreDiag.tentado = true;
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
              const workerVer = res.headers.get("X-Core-Stream-Version");
              coreDiag.workerVersion = workerVer;
              coreDiag.status = res.status;
              coreDiag.motivo =
                res.headers.get("X-Core-Error") ??
                (!workerVer
                  ? `Worker AWS desatualizado (esperado ${CORE_STREAM_VERSION}) — respondeu HTTP ${res.status} sem X-Core-Stream-Version`
                  : `Core respondeu HTTP ${res.status}`);
              console.log(
                `[stream-proxy][core] url=${maskMedia(candidate)} status=${res.status} ct=${res.headers.get("content-type")} worker=${workerVer ?? "DESATUALIZADO(sem versão)"} erro=${res.headers.get("X-Core-Error") ?? "-"}`
              );
              if (!workerVer) {
                console.warn(
                  `[stream-proxy][core] Worker AWS roda versão antiga do stream (esperado ${CORE_STREAM_VERSION}). Faça git pull + docker compose up -d --build na EC2.`
                );
              }
              if (res.ok || res.status === 206) {
                upstream = res;
                usedUrl = candidate;
                deliveredVia = "core";
                return;
              }
              await res.body?.cancel();
              lastStatus = res.status;

            } catch (e) {
              const msg = (e as Error).name === "TimeoutError"
                ? "Timeout de 15s ao chamar o Core AWS"
                : `Falha de rede ao chamar o Core: ${(e as Error).message}`;
              coreDiag.motivo = msg;
              console.warn(`[stream-proxy][core] relay falhou: ${msg}`);
            }
          }
        };

        // Fluxo: Core primeiro. Em modo validação (forceCore=1) NÃO há fallback
        // silencioso para o Painel — o motivo real do Core é devolvido ao HUD.
        await attemptCore();
        if (!upstream && !forceCore) await attemptDirect();

        const coreHeaders: Record<string, string> = {
          "X-Core-Status": String(coreDiag.status ?? "-"),
          "X-Core-Worker-Version": coreDiag.workerVersion ?? "ausente",
          ...(coreDiag.motivo ? { "X-Core-Error": coreDiag.motivo } : {}),
        };

        const found = upstream as Response | null;

        if (!found && forceCore) {
          const reason = `Core não entregou o stream: ${coreDiag.motivo ?? "motivo desconhecido"}`;
          console.error(`[STREAM RESPONSE][core-forced] status=${coreDiag.status ?? 502} reason="${reason}"`);
          return new Response(reason, {
            status: coreDiag.status && coreDiag.status >= 400 ? coreDiag.status : 502,
            headers: {
              ...CORS,
              ...coreHeaders,
              "Content-Type": "text/plain; charset=utf-8",
              "X-Playback-Reason": reason,
              "X-Playback-Via": "core",
            },
          });
        }

        if (!found) {
          const reason = blockedDirect
            ? `Servidor bloqueou o acesso direto e o Core também não conseguiu entregar o stream. Core: ${coreDiag.motivo ?? "-"}`
            : `Servidor não entregou o stream (HTTP ${lastStatus || "sem resposta"}). Core: ${coreDiag.motivo ?? "-"}`;
          console.error(`[STREAM RESPONSE][${deliveredVia}] status=${lastStatus || 502} reason="${reason}"`);
          return new Response(reason, {
            status: lastStatus || 502,
            headers: { ...CORS, ...coreHeaders, "X-Playback-Reason": reason, "X-Playback-Via": deliveredVia },
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
