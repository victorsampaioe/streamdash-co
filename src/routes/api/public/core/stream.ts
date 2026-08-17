import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { CORE_STREAM_VERSION } from "@/lib/core-version";
import { readSegmentCacheEnv, segmentCacheDecision } from "@/lib/stream-cache";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Playback-Via, X-Playback-Segments, X-Playback-Reason, X-Playback-Incompatible, X-Playback-Codec-Video, X-Playback-Codec-Audio, X-Playback-Action, X-Core-Error, X-Core-Status, X-Core-Stream-Version, X-Core-Worker-Version, X-Core-UA, X-Upstream-Status, X-Upstream-Content-Type, X-Upstream-Url",
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
  // Upstream text/plain em stream de mídia = página de bloqueio, não confiar.
  if (upstream && !/^text\//i.test(upstream)) return upstream;
  return "application/octet-stream";
}

/* ------------------------------------------------------------------ */
/* Assinatura das URLs repassadas ao Core AWS (worker stateless)        */
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

/**
 * Headers HTTP só aceitam ByteString (latin-1). Motivos de diagnóstico contêm
 * travessões/acentos vindos do upstream e quebravam a resposta com
 * "Cannot convert argument to a ByteString" (virava 502 falso na TV ao vivo).
 */
function asciiHeader(v: string): string {
  return v.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "?").slice(0, 900);
}

/**
 * Reescreve as URLs internas de um manifesto HLS para passarem pelo proxy.
 * Os segmentos são assinados (HMAC + exp): painéis Xtream redirecionam o live
 * para CDNs de outros hosts, então validamos a assinatura em vez do hostname.
 */
function rewriteManifest(manifest: string, upstreamUrl: string, token: string, mode: string) {
  const baseUrl = new URL(upstreamUrl);
  const segExp = Math.floor(Date.now() / 1000) + 3600;
  let segmentos = 0;
  
  const toProxy = (raw: string) => {
    try {
      // Já reescrito por outra camada (ex.: Core devolveu manifesto pronto).
      if (raw.startsWith("/api/public/core/stream") || raw.includes("/api/public/core/stream?")) {
        segmentos += 1;
        return raw;
      }
      // Resolve URL relativa (de segmentos, chaves, etc) para absoluta
      const abs = new URL(raw, baseUrl).toString();

      const segExt = (abs.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? "ts").toLowerCase();
      segmentos += 1;
      
      // Assinatura de cada segmento para permitir acesso à CDN final
      const p = new URLSearchParams({
        token,
        mode: mode || "proxy",
        type: "live",
        ext: segExt,
        via: "core", 
        exp: String(segExp),
        sig: signUpstream(abs, segExp),
        u: b64urlEncode(abs),
        forceCore: "1",
      });
      return `/api/public/core/stream?${p.toString()}`;
    } catch (e) {
      console.warn(`[HLS][rewriteManifest] Falha ao resolver URL: ${raw}`, e);
      return raw;
    }
  };

  // Processa linhas do HLS: URLs, #EXT-X-STREAM-INF, #EXT-X-KEY, #EXT-X-MEDIA...
  const out = manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#EXT-X-ENDLIST")) return line;
      
      // #EXT-X-KEY: URI="..."
      if (trimmed.startsWith("#EXT-X-KEY:")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toProxy(uri)}"`);
      }
      // #EXT-X-MEDIA: URI="..."
      if (trimmed.startsWith("#EXT-X-MEDIA:")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toProxy(uri)}"`);
      }
      // URLs de playlist/segmento (não iniciam com #)
      if (!trimmed.startsWith("#")) {
        return toProxy(trimmed);
      }
      return line;
    })
    .join("\n");
    
  console.log(`[HLS][rewriteManifest] URL original: ${maskMedia(upstreamUrl)} | Segmentos reescritos: ${segmentos}`);
  return { manifest: out, segmentos };
}


function maskMedia(url: string) {
  return url.replace(/\/\/([^/]+)\/(live|movie|series)\/[^/]+\/[^/]+\//, "//$1/$2/***/***/");
}

/** Modo de reprodução tentado, sempre informado ao HUD (sem fallback silencioso). */
type Modo = "PAINEL" | "PAINEL-SMARTERS" | "PAINEL-VLC" | "CORE" | "CORE-VLC";

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

        const modeStart = url.searchParams.get("mode") || "proxy";
        const viaCoreStart = url.searchParams.get("via") === "core";
        const isCoreStart = process.env.IS_CORE === "true";
        const forceCoreStart = url.searchParams.get("forceCore") === "1";
        const startPath = forceCoreStart || viaCoreStart || isCoreStart ? "CORE" : "PAINEL";
        console.log(`[STREAM START] path=${url.pathname} modo=${startPath} submodo=${modeStart} type=${type} ext=${ext} range=${range ?? "none"} isCore=${isCoreStart} viaCore=${viaCoreStart} token=${token ? "presente" : "ausente"} u=${passthrough ? "presente" : "ausente"}`);
        
        // Note: For ADMIN MASTER (victorsampaio133@gmail.com), 
        // access is granted via the standard session validation below.


        const { UA_PLAYER, UA_VLC, UA_BROWSER } = await import("@/lib/iptv.server");
        const uaFor = (kind: string | null) =>
          kind === "vlc" ? UA_VLC : kind === "browser" ? UA_BROWSER : UA_PLAYER;

        const sig = url.searchParams.get("sig");
        const expRaw = url.searchParams.get("exp");
        const exp = Number(expRaw ?? 0);
        const isCore = process.env.IS_CORE === "true";
        const viaCore = url.searchParams.get("via") === "core";
        const VER = { "X-Core-Stream-Version": CORE_STREAM_VERSION };

        const badRequest = (motivo: string, detalhe: Record<string, unknown>) => {
          console.error(
            `[CORE REQUEST] status=400 erro="${motivo}" payload_valido=false assinatura=${sig ? "presente" : "ausente"} ${JSON.stringify(detalhe)}`
          );
          return new Response(motivo, {
            status: 400,
            headers: { ...CORS, ...VER, "X-Core-Error": asciiHeader(motivo) },
          });
        };

        /* ---------------------------------------------------------- */
        /* MODO WORKER (Core AWS): só serve URLs assinadas.            */
        /* ---------------------------------------------------------- */
        if (isCore || viaCore || sig || expRaw) {
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
          const modeKind = url.searchParams.get("mode") ?? "proxy";
          try {
            abs = b64urlDecode(passthrough);
            new URL(abs);
          } catch {
            return badRequest("Parâmetro 'u' não é uma URL base64url válida", {});
          }

          if (exp * 1000 < Date.now()) {
            console.error(`[CORE REQUEST] status=403 erro="URL assinada expirada"`);
            return new Response("URL assinada expirada", {
              status: 403,
              headers: { ...CORS, ...VER, "X-Core-Error": "exp expirado (assinatura vencida)" },
            });
          }
          if (!verifyUpstream(abs, exp, sig)) {
            console.error(`[CORE REQUEST] status=403 erro="Assinatura HMAC inválida"`);
            return new Response("Assinatura inválida", {
              status: 403,
              headers: { ...CORS, ...VER, "X-Core-Error": "assinatura HMAC inválida (CRON_SECRET divergente)" },
            });
          }

          // Painéis Xtream costumam aceitar apenas o UA de player real
          // (VLC e navegador recebem "Access denied"/403). Player é o padrão.
          const uaKind = url.searchParams.get("ua") ?? "player";

          const ua = uaFor(uaKind);
          const origin = new URL(abs).origin;
          const h: Record<string, string> = {
            "User-Agent": ua,
            Accept:
              ext === "m3u8" ? "application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*" : "*/*",
            "Accept-Encoding": "identity",
            Connection: "keep-alive",
            "Icy-MetaData": "1", // Alguns servidores SHOUTcast/IPTV precisam disso para não cortar a conexão
          };
          // VLC/IPTV Smarters NÃO enviam Referer/Origin — muitos painéis
          // devolvem 403 justamente por causa desses headers de navegador.
          if (uaKind === "browser") {
            h["Referer"] = `${origin}/`;
            h["Origin"] = origin;
          }
          if (range) h["Range"] = range;

          console.log(
            `[STREAM DEBUG][CORE REQUEST] recebido type=${type} ext=${ext} ua=${uaKind} range=${range ?? "none"} url=${maskMedia(abs)} sig=${sig ? "presente" : "ausente"} exp=${expRaw} headers=${JSON.stringify({ ...h, "User-Agent": ua.slice(0, 40) })}`
          );

          const t0 = Date.now();
          try {
            // Otimização VOD: timeout maior e blocos eficientes
            const isVod = type === "movie" || type === "series";
            const isHlsManifest = ext === "m3u8" || (type === "live" && !ext.includes("ts"));
            const timeout = isVod ? 60000 : 30000;
            
            if (isHlsManifest) {
              console.log(`[HLS] solicitando manifesto: ${maskMedia(abs)}`);
            }

            const res = await fetch(abs, {
              headers: h,
              redirect: "follow",
              signal: AbortSignal.timeout(timeout),
              keepalive: true,
            });

            // Painéis Xtream redirecionam (302) para CDNs externas. As URIs do
            // manifesto são relativas à URL FINAL, não à URL do painel.
            const finalUrl = res.url || abs;
            if (isHlsManifest && finalUrl !== abs) {
              console.log(`[HLS] redirecionado para CDN final: ${maskMedia(finalUrl)}`);
            }


            // LOG DE DIAGNÓSTICO PROFUNDO [STREAM DEBUG]
            console.log(`[STREAM DEBUG]
- URL original: ${maskMedia(abs)}
- URL enviada para Core: ${request.url}
- HTTP upstream: ${res.status}
- Content-Type: ${res.headers.get("content-type") ?? "unknown"}
- Content-Length: ${res.headers.get("content-length") ?? "unknown"}
- Range solicitado: ${range ?? "none"}
- Range devolvido: ${res.headers.get("content-range") ?? "none"}
- UA utilizado: ${uaKind}
`);

            const out = new Headers({ ...CORS, ...VER });
            for (const k of ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]) {
              const v = res.headers.get(k);
              if (v) out.set(k, v);
            }
            
            // Alguns painéis devolvem "Accept-Ranges: 0-123456" (inválido).
            // O navegador só entende "bytes"; normalizamos sempre.
            const arUp = out.get("Accept-Ranges");
            if (arUp && !/^(bytes|none)$/i.test(arUp.trim())) out.set("Accept-Ranges", "bytes");
            if (!out.has("Accept-Ranges") && (type !== "live" || res.status === 206)) {
              out.set("Accept-Ranges", "bytes");

            }
            
            // Garantir Content-Type correto
            const upstreamContentType = res.headers.get("content-type");
            if (!out.has("Content-Type")) out.set("Content-Type", contentTypeFor(ext, upstreamContentType));
            if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");
            
            // Otimização VOD: Cache agressivo no browser e blocos eficientes
            if (isVod && !isHlsManifest) {
              out.set("Cache-Control", "public, max-age=3600");
            } else {
              out.set("Cache-Control", "no-cache");
            }

            // Etapa 3 — cache compartilhado (CDN) apenas para segmentos de TV ao vivo.
            // Desligado por padrão: HLS_SEGMENT_CACHE=on ativa. Rollback = voltar para off.
            // Nunca aplica a manifesto (.m3u8), a VOD com Range, nem a respostas de erro.
            const cacheEnv = readSegmentCacheEnv();
            const cacheDecision = segmentCacheDecision({
              type,
              ext,
              isHlsManifest,
              status: res.status,
              hasRange: Boolean(range),
              enabled: cacheEnv.enabled,
              ttlSeconds: cacheEnv.ttlSeconds,
            });
            if (cacheDecision) {
              out.set("Cache-Control", cacheDecision.cacheControl);
              if (cacheDecision.hitHeader) out.set("X-Core-Cache", cacheDecision.hitHeader);
            }
            
            out.set("X-Upstream-Status", String(res.status));
            out.set("X-Upstream-Content-Type", upstreamContentType ?? "-");
            out.set("X-Core-UA", uaKind);
            out.set("Connection", "keep-alive");

            if (ext === "ts" || ext === "m4s" || type === "live") {
              console.log(
                `[HLS SEGMENT] URL=${maskMedia(abs)} STATUS=${res.status} TEMPO=${Date.now() - t0}ms CONTENT-TYPE=${upstreamContentType ?? "-"} RANGE=${range ?? "none"}`
              );
            }

            if (isHlsManifest) {
              console.log(`[HLS] manifesto recebido: status=${res.status} ct=${upstreamContentType} tempo=${Date.now() - t0}ms`);
            }

            console.log(
              `[STREAM DEBUG][UPSTREAM IPTV] url=${maskMedia(abs)} ua=${uaKind} status=${res.status} content-type=${upstreamContentType ?? "-"} range=${range ?? "none"} content-range=${res.headers.get("content-range") ?? "-"} tempo=${Date.now() - t0}ms`
            );

            if (!res.ok && res.status !== 206) {
              if (isHlsManifest) {
                console.error(`[HLS] falha ao obter manifesto: status=${res.status} url=${maskMedia(abs)}`);
              }
              // Corpo do bloqueio ajuda a identificar o motivo real do 403.
              let corpo = "";
              try { corpo = (await res.text()).slice(0, 200).replace(/\s+/g, " "); } catch { /* ignore */ }
              const motivo = `Origem IPTV respondeu HTTP ${res.status} com UA=${uaKind}${corpo ? ` — resposta: "${corpo}"` : ""}`;
              console.error(`[UPSTREAM IPTV][bloqueio] ${motivo} url=${maskMedia(abs)}`);
              if (ext === "ts" || ext === "m4s" || type === "live") {
                console.error(`[HLS SEGMENT] URL=${maskMedia(abs)} STATUS=${res.status} ERRO="${motivo}"`);
              }
              out.set("X-Playback-Reason", asciiHeader(motivo));
              out.set("X-Core-Error", asciiHeader(motivo));
              out.set("Content-Type", "text/plain; charset=utf-8");
              // Erro nunca entra em cache compartilhado.
              out.set("Cache-Control", "no-store");
              out.delete("X-Core-Cache");
              return new Response(motivo, { status: res.status, headers: out });
            }

            if (isHlsManifest) {
              const body = await res.text();
              const { manifest: rewritten, segmentos } = rewriteManifest(body, finalUrl, token!, modeKind as any);
              console.log(`[HLS] manifest entregue | segments=${segmentos} | status=${res.status}`);
              return new Response(rewritten, {
                status: res.status,
                headers: { ...Object.fromEntries(out), "Content-Type": "application/vnd.apple.mpegurl" },
              });
            }

            // Se o Content-Type upstream for text/html ou similar e for live,
            // pode ser um redirecionamento ou página de erro 403 mas com status 200.
            if (res.status === 200 && /text\/html/.test(res.headers.get("content-type") || "")) {
               const html = await res.text();
               if (html.includes("403") || html.includes("Forbidden")) {
                  const msg = `Upstream retornou página 403 (Forbidden) disfarçada de 200 com UA=${uaKind}`;
                  out.set("X-Core-Error", asciiHeader(msg));
                  out.set("Cache-Control", "no-store");
                  out.delete("X-Core-Cache");
                  return new Response(msg, { status: 403, headers: out });
               }
            }
            
            return new Response(res.body, { status: res.status, headers: out });
          } catch (e) {
            const msg = (e as Error).message;
            if (ext === "m3u8") {
              console.error(`[STREAM DEBUG][HLS] erro fatal de rede no manifesto: ${msg} url=${maskMedia(abs)}`);
            }
            console.error(
              `[STREAM DEBUG][UPSTREAM IPTV] url=${maskMedia(abs)} ua=${uaKind} status=502 tempo=${Date.now() - t0}ms erro="${msg}"`
            );
            if (ext === "ts" || ext === "m4s" || type === "live") {
              console.error(`[STREAM DEBUG][HLS SEGMENT] URL=${maskMedia(abs)} STATUS=502 ERRO="${msg}"`);
            }
            return new Response(`Worker fetch error: ${msg}`, {
              status: 502,
              headers: {
                ...CORS,
                ...VER,
                "X-Core-Error": asciiHeader(msg),
                "X-Core-UA": uaKind,
                "Cache-Control": "no-store",
              },
            });
          }
        }

        /* ---------------------------------------------------------- */
        /* MODO PAINEL: resolve sessão, monta candidatos e escalona.   */
        /* ---------------------------------------------------------- */
        if (!token || (!sid && !passthrough)) {
          return badRequest(
            !token ? "Token de sessão ausente" : "Informe 'sid' (conteúdo) ou 'u' (URL interna do HLS)",
            { token: Boolean(token), sid, passthrough: Boolean(passthrough) }
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: session, error: sessionErr } = await supabaseAdmin
          .from("player_sessions")
          .select("id, server_id, token, expires_at, xtream_user, xtream_pass")
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (sessionErr || !session) return new Response("Unauthorized", { status: 401, headers: CORS });

        const { data: server } = await supabaseAdmin
          .from("servers")
          .select("host")
          .eq("id", session.server_id)
          .single();

        if (!server) return new Response("Server not found", { status: 404, headers: CORS });

        const { getPlayerCredentials, hostCandidates } = await import("@/lib/player.server");

        let candidates: string[];
        if (passthrough) {
          const abs = b64urlDecode(passthrough);
          const pexp = Number(url.searchParams.get("exp") ?? 0);
          const psig = url.searchParams.get("sig") ?? "";
          const assinado = psig ? verifyUpstream(abs, pexp, psig) : false;
          // Segmento assinado pelo próprio manifesto (pode ser CDN externa) ou,
          // por compatibilidade, mesmo host do servidor da sessão.
          const allowed = hostCandidates(server.host).map((c) => new URL(c).hostname);
          if (!assinado && !allowed.includes(new URL(abs).hostname)) {
            console.error(`[STREAM SEGMENT] 403 host não autorizado e sem assinatura url=${maskMedia(abs)}`);
            return new Response("Segmento não autorizado (host externo sem assinatura válida)", {
              status: 403,
              headers: { ...CORS, "X-Playback-Reason": "segmento sem assinatura válida" },
            });
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
          
          // Ordem de candidatos otimizada para compatibilidade
          candidates = hostCandidates(server.host).flatMap((base) => {
            if (type === "live") {
              // Navegador só reproduz HLS: .m3u8 primeiro; .ts (mpegts contínuo)
              // fica como último recurso.
              return [
                `${base}/live/${user}/${pass}/${sid}.m3u8`,
                `${base}/${user}/${pass}/${sid}.m3u8`,
                `${base}/live/${user}/${pass}/${sid}.ts`,
                `${base}/${user}/${pass}/${sid}.ts`,
                `${base}/live/${user}/${pass}/${sid}`
              ];
            }

            return [`${base}/${folder}/${user}/${pass}/${sid}.${ext}`, `${base}/${folder}/${user}/${pass}/${sid}.mp4`];
          });
        }
        candidates = [...new Set(candidates)].slice(0, 8);

        /* --------- Escalonamento de modos (browser → CORE-VLC) ------ */
        type Tentativa = { modo: Modo; status: number | null; motivo: string | null; ms: number };
        const tentativas: Tentativa[] = [];
        let upstream: Response | null = null;
        let usedUrl = "";
        let coreWorkerVersion: string | null = null;
        const modeParam = (url.searchParams.get("mode") || "").toUpperCase();
        let usedModo: Modo = modeParam.includes("CORE") ? (modeParam as Modo) : "PAINEL";
        
        // MP4/MOV: forçamos Core por padrão para garantir Range 206, exceto se mode for PAINEL
        const isVodMp4 = type === "movie" || type === "series";
        const forceCore = url.searchParams.get("forceCore") === "1" || 
                         (modeParam.startsWith("CORE")) ||
                         (isVodMp4 && modeParam !== "PAINEL");

        const { coreApiUrl, isCoreInstance } = await import("@/lib/core-api.server");
        const coreBase = coreApiUrl();
        const coreIndisponivel =
          !coreBase
            ? "CORE_API_URL não configurada no Painel"
            : isCoreInstance()
              ? "Esta instância é o próprio Core"
              : !process.env.CRON_SECRET
                ? "CRON_SECRET ausente no Painel (não é possível assinar)"
                : null;

        const tentarPainel = async (modo: Modo, uaKind: "browser" | "vlc" | "player") => {
          const headers: Record<string, string> = {
            "User-Agent": uaFor(uaKind),
            Accept: ext === "m3u8" ? "application/vnd.apple.mpegurl,*/*" : "*/*",
            "Accept-Encoding": "identity",
          };
          if (range) headers["Range"] = range;
          // No máximo 3 URLs por modo: a escada tem 5 modos, evita espera longa.
          for (const candidate of candidates.slice(0, 3)) {
            const t0 = Date.now();
            try {
              const res = await fetch(candidate, {
                headers,
                redirect: "follow",
                signal: AbortSignal.timeout(15000),
              });
              const ct = res.headers.get("content-type") ?? "-";
              console.log(
                `[STREAM ATTEMPT][${modo}] url=${maskMedia(candidate)} ua=${uaKind} status=${res.status} ct=${ct} tempo=${Date.now() - t0}ms`
              );
              if (res.ok || res.status === 206) {
                upstream = res;
                usedUrl = res.url || candidate;
                usedModo = modo;
                tentativas.push({ modo, status: res.status, motivo: null, ms: Date.now() - t0 });
                return;
              }
              let corpo = "";
              try { corpo = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch { /* ignore */ }
              tentativas.push({
                modo,
                status: res.status,
                motivo: `HTTP ${res.status} (${ct})${corpo ? ` — "${corpo}"` : ""}`,
                ms: Date.now() - t0,
              });
            } catch (e) {
              tentativas.push({ modo, status: null, motivo: (e as Error).message, ms: Date.now() - t0 });
            }
          }
        };

        const tentarCore = async (modo: Modo, uaKind: "vlc" | "player") => {
          if (coreIndisponivel) {
            tentativas.push({ modo, status: null, motivo: coreIndisponivel, ms: 0 });
            return;
          }
          const expires = Math.floor(Date.now() / 1000) + 300;
          // No máximo 3 URLs por modo: a escada tem 5 modos, evita espera longa.
          for (const candidate of candidates.slice(0, 3)) {
            const relay = new URL(`${coreBase}/api/public/core/stream`);
            relay.searchParams.set("u", b64urlEncode(candidate));
            relay.searchParams.set("exp", String(expires));
            relay.searchParams.set("sig", signUpstream(candidate, expires));
            relay.searchParams.set("type", type);
            relay.searchParams.set("ext", ext);
            relay.searchParams.set("ua", uaKind);
             relay.searchParams.set("via", "core");
             relay.searchParams.set("forceCore", "1");
            const t0 = Date.now();
            try {
              const timeout = type === "live" ? 20000 : 60000;
              const res = await fetch(relay.toString(), {
                headers: range ? { Range: range } : {},
                redirect: "follow",
                signal: AbortSignal.timeout(timeout),
              });
              coreWorkerVersion = res.headers.get("X-Core-Stream-Version") ?? coreWorkerVersion;
              const upstreamStatus = res.headers.get("X-Upstream-Status") ?? "-";
              console.log(
                `[STREAM DEBUG][STREAM ATTEMPT][${modo}] url=${maskMedia(candidate)} ua=${uaKind} core_status=${res.status} upstream=${upstreamStatus} ct=${res.headers.get("content-type") ?? "-"} worker=${coreWorkerVersion ?? "sem versão"} erro=${res.headers.get("X-Core-Error") ?? "-"} tempo=${Date.now() - t0}ms`
              );
              if (res.ok || res.status === 206) {
                upstream = res;
                usedUrl = candidate;
                usedModo = modo;
                tentativas.push({ modo, status: res.status, motivo: null, ms: Date.now() - t0 });
                return;
              }
              const motivo =
                res.headers.get("X-Core-Error") ??
                (!coreWorkerVersion
                  ? `Worker AWS desatualizado (esperado ${CORE_STREAM_VERSION}) — HTTP ${res.status} sem X-Core-Stream-Version`
                  : `Core respondeu HTTP ${res.status} (upstream ${upstreamStatus})`);
              await res.body?.cancel();
              tentativas.push({ modo, status: res.status, motivo, ms: Date.now() - t0 });
            } catch (e) {
              const msg =
                (e as Error).name === "TimeoutError"
                  ? `Timeout de ${type === "live" ? 20 : 60}s ao chamar o Core AWS`
                  : `Falha de rede ao chamar o Core: ${(e as Error).message}`;
              tentativas.push({ modo, status: null, motivo: msg, ms: Date.now() - t0 });
            }
          }
        };

        // Escada de compatibilidade (sem fallback silencioso — tudo é reportado):
        // O UA de player real é o único aceito pela maioria dos painéis Xtream
        // (navegador e VLC recebem "Access denied"/403), então vem primeiro.
        if (!forceCore) {
          await tentarPainel("PAINEL-SMARTERS", "player");
          if (!upstream) await tentarPainel("PAINEL-VLC", "vlc");
          if (!upstream) await tentarPainel("PAINEL", "browser");
        }

        // Se forçado (ex: VOD) ou falhou no painel
        if (!upstream) await tentarCore("CORE", "player");
        if (!upstream) await tentarCore("CORE-VLC", "vlc");

        // Fallback explícito: se o Core falhou (ex.: worker AWS desatualizado),
        // o Painel ainda tenta entregar direto. Todas as tentativas continuam
        // registradas em `tentativas` (nada é silenciado).
        if (!upstream && forceCore && !isCoreInstance()) {
          await tentarPainel("PAINEL-SMARTERS", "player");
          if (!upstream) await tentarPainel("PAINEL-VLC", "vlc");
          if (!upstream) await tentarPainel("PAINEL", "browser");
        }



        const resumo = tentativas
          .map((t) => `${t.modo}=${t.status ?? "erro"}${t.motivo ? ` (${t.motivo})` : ""}`)
          .join(" | ");

        const diagHeaders: Record<string, string> = {
          "X-Core-Worker-Version": coreWorkerVersion ?? "ausente",
          "X-Core-Status": String(tentativas.find((t) => t.modo.startsWith("CORE"))?.status ?? "-"),
        };

        const found = upstream as Response | null;

        if (!found) {
          const ultimo = tentativas[tentativas.length - 1];
          const reason = `Nenhum modo entregou o stream. Tentativas: ${resumo || "nenhuma"}`;
          console.error(`[STREAM RESPONSE] status=${ultimo?.status ?? 502} ${reason}`);
          return new Response(reason, {
            status: ultimo?.status && ultimo.status >= 400 ? ultimo.status : 502,
            headers: {
              ...CORS,
              ...diagHeaders,
              "Content-Type": "text/plain; charset=utf-8",
              "X-Playback-Via": tentativas[0]?.modo ?? "PAINEL",
              "X-Playback-Reason": asciiHeader(reason),
              "X-Core-Error": asciiHeader(ultimo?.motivo ?? reason),
            },
          });
        }


        const upstreamType = found.headers.get("Content-Type");
        const isManifest = /mpegurl|m3u/i.test(upstreamType ?? "") || /\.m3u8(\?|$)/i.test(usedUrl) || type === "live";

        // Manifesto HLS → segmentos passam pelo mesmo modo que funcionou.
        if (isManifest) {
          const tManifesto = Date.now();
          const text = await found.text();
          const { manifest: rewritten, segmentos } = rewriteManifest(text, usedUrl, token, usedModo);
          
          console.log(
            `[HLS][FINAL]\nURL original: ${maskMedia(usedUrl)}\nManifesto: ${text.length} bytes\nStatus manifesto: ${found.status}\nSegmentos encontrados: ${segmentos}\nTempo resposta: ${Date.now() - tManifesto}ms\nFE_VER: 2026.08.17-fe-v1\nCORE_VER: ${CORE_STREAM_VERSION}`
          );
          return new Response(rewritten, {
            status: 200,
            headers: {
              ...CORS,
              ...diagHeaders,
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-cache",
              "X-Playback-Via": usedModo,
              "X-Playback-Segments": String(segmentos),
              "X-Upstream-Status": String(found.headers.get("X-Upstream-Status") ?? found.status),
              "X-Playback-Reason": asciiHeader(resumo || "OK"),
            },
          });

        }

        const finalExt = (usedUrl.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? ext).toLowerCase();

        const out = new Headers({ ...CORS, ...diagHeaders });
        out.set("Cache-Control", "no-cache");
        out.set("Content-Type", contentTypeFor(finalExt, upstreamType));
        out.set("X-Playback-Via", usedModo);
        out.set("X-Upstream-Status", String(found.headers.get("X-Upstream-Status") ?? found.status));
        out.set("X-Upstream-Content-Type", found.headers.get("X-Upstream-Content-Type") ?? upstreamType ?? "-");
        for (const h of ["Content-Range", "Content-Length", "Accept-Ranges"]) {
          const v = found.headers.get(h);
          if (v) out.set(h, v);
        }
        const arFinal = out.get("Accept-Ranges");
        if (arFinal && !/^(bytes|none)$/i.test(arFinal.trim())) out.set("Accept-Ranges", "bytes");
        if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");


        // Diagnóstico de CODEC real: o arquivo é entregue (200/206), mas pode
        // conter H265/AC3/DTS que o navegador não decodifica
        // (DEMUXER_ERROR_NO_SUPPORTED_STREAMS). Só na primeira faixa do arquivo.
        const primeiraFaixa = !range || /^bytes=0-/.test(range);
        if (type !== "live" && primeiraFaixa && !isManifest) {
          const { probeCodecs } = await import("@/lib/codec-probe.server");
          const info = await probeCodecs(usedUrl, finalExt, usedModo.includes("VLC") ? UA_VLC : UA_PLAYER);
          if (info) {
            out.set("X-Playback-Codec-Video", info.video ?? "desconhecido");
            out.set("X-Playback-Codec-Audio", info.audio ?? "desconhecido");
            out.set("X-Playback-Action", info.action);
            if (!info.browserSupported && info.reason) {
              out.set("X-Playback-Incompatible", finalExt);
              out.set("X-Playback-Reason", asciiHeader(info.reason));
            }
            console.log(
              `[CODEC] via=${usedModo} ext=${finalExt} video=${info.video ?? "?"} audio=${info.audio ?? "?"} suportado=${info.browserSupported} acao=${info.action}`
            );
          }
        }

        console.log(
          `[STREAM DEBUG][STREAM RESPONSE] via=${usedModo} type=${type} ext=${finalExt} status=${found.status} ct=${out.get("Content-Type")} range=${range ?? "none"} tentativas="${resumo}"`
        );

        return new Response(found.body, { status: found.status, headers: out });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
