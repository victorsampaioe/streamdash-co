import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { CORE_STREAM_VERSION } from "@/lib/core-version";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Playback-Via, X-Playback-Reason, X-Playback-Incompatible, X-Playback-Codec-Video, X-Playback-Codec-Audio, X-Playback-Action, X-Core-Error, X-Core-Status, X-Core-Stream-Version, X-Core-Worker-Version, X-Core-UA, X-Upstream-Status, X-Upstream-Content-Type, X-Upstream-Url",
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
 * Reescreve as URLs internas de um manifesto HLS para passarem pelo proxy.
 * Os segmentos são assinados (HMAC + exp): painéis Xtream redirecionam o live
 * para CDNs de outros hosts, então validamos a assinatura em vez do hostname.
 */
function rewriteManifest(manifest: string, upstreamUrl: string, token: string, mode: string) {
  const baseUrl = new URL(upstreamUrl);
  const segExp = Math.floor(Date.now() / 1000) + 3600;
  let segmentos = 0;
  const toProxy = (raw: string) => {
    const abs = new URL(raw, baseUrl).toString();
    const segExt = (abs.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? "ts").toLowerCase();
    segmentos += 1;
    const p = new URLSearchParams({
      token,
      mode,
      type: "live",
      ext: segExt,
      // Segmentos seguem obrigatoriamente pelo Core (mesma camada do manifesto).
      forceCore: "1",
      pexp: String(segExp),
      psig: signUpstream(abs, segExp),
      u: b64urlEncode(abs),
    });
    return `/api/public/core/stream?${p.toString()}`;
  };
  const out = manifest
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
            headers: { ...CORS, ...VER, "X-Core-Error": motivo },
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

          // Modo VLC: emula exatamente o cliente que funciona no VLC/IPTV Smarters.
          const uaKind = url.searchParams.get("ua") ?? (type === "live" ? "player" : "vlc");
          const ua = uaFor(uaKind);
          const origin = new URL(abs).origin;
          const h: Record<string, string> = {
            "User-Agent": ua,
            Accept:
              ext === "m3u8" ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" : "*/*",
            "Accept-Encoding": "identity",
            Connection: "keep-alive",
          };
          // VLC/IPTV Smarters NÃO enviam Referer/Origin — muitos painéis
          // devolvem 403 justamente por causa desses headers de navegador.
          if (uaKind === "browser") {
            h["Referer"] = `${origin}/`;
            h["Origin"] = origin;
          }
          if (range) h["Range"] = range;

          console.log(
            `[CORE REQUEST] recebido type=${type} ext=${ext} ua=${uaKind} range=${range ?? "none"} url=${maskMedia(abs)} headers_enviados=${JSON.stringify({ ...h, "User-Agent": ua.slice(0, 40) })}`
          );

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
            out.set("X-Upstream-Content-Type", res.headers.get("content-type") ?? "-");
            out.set("X-Core-UA", uaKind);

            console.log(
              `[UPSTREAM IPTV] url=${maskMedia(abs)} ua=${uaKind} status=${res.status} content-type=${res.headers.get("content-type") ?? "-"} range=${range ?? "none"} content-range=${res.headers.get("content-range") ?? "-"} tempo=${Date.now() - t0}ms`
            );

            if (!res.ok && res.status !== 206) {
              // Corpo do bloqueio ajuda a identificar o motivo real do 403.
              let corpo = "";
              try { corpo = (await res.text()).slice(0, 200).replace(/\s+/g, " "); } catch { /* ignore */ }
              const motivo = `Origem IPTV respondeu HTTP ${res.status} com UA=${uaKind}${corpo ? ` — resposta: "${corpo}"` : ""}`;
              console.error(`[UPSTREAM IPTV][bloqueio] ${motivo} url=${maskMedia(abs)}`);
              out.set("X-Playback-Reason", motivo);
              out.set("X-Core-Error", motivo);
              out.set("Content-Type", "text/plain; charset=utf-8");
              return new Response(motivo, { status: res.status, headers: out });
            }

            return new Response(res.body, { status: res.status, headers: out });
          } catch (e) {
            const msg = (e as Error).message;
            console.error(
              `[UPSTREAM IPTV] url=${maskMedia(abs)} ua=${uaKind} status=502 tempo=${Date.now() - t0}ms erro="${msg}"`
            );
            return new Response(`Worker fetch error: ${msg}`, {
              status: 502,
              headers: { ...CORS, ...VER, "X-Core-Error": msg, "X-Core-UA": uaKind },
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
          const pexp = Number(url.searchParams.get("pexp") ?? 0);
          const psig = url.searchParams.get("psig") ?? "";
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
          candidates = hostCandidates(server.host).flatMap((base) => {
            const paths =
              type === "live"
                ? [`live/${user}/${pass}/${sid}.m3u8`, `${user}/${pass}/${sid}.m3u8`, `live/${user}/${pass}/${sid}.ts`]
                : [`${folder}/${user}/${pass}/${sid}.${ext}`, `${folder}/${user}/${pass}/${sid}.mp4`];
            return paths.map((p) => `${base}/${p}`);
          });
        }
        candidates = candidates.slice(0, 6);

        /* --------- Escalonamento de modos (browser → CORE-VLC) ------ */
        type Tentativa = { modo: Modo; status: number | null; motivo: string | null; ms: number };
        const tentativas: Tentativa[] = [];
        let upstream: Response | null = null;
        let usedUrl = "";
        let usedModo: Modo = "PAINEL";
        let coreWorkerVersion: string | null = null;
        // Modo solicitado explicitamente (ex.: segmentos HLS mantêm o modo do manifesto).
        const modeParam = (url.searchParams.get("mode") || "").toUpperCase();
        const forceCore = url.searchParams.get("forceCore") === "1" || modeParam.startsWith("CORE");

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
            const t0 = Date.now();
            try {
              const res = await fetch(relay.toString(), {
                headers: range ? { Range: range } : {},
                redirect: "follow",
                signal: AbortSignal.timeout(15000),
              });
              coreWorkerVersion = res.headers.get("X-Core-Stream-Version") ?? coreWorkerVersion;
              const upstreamStatus = res.headers.get("X-Upstream-Status") ?? "-";
              console.log(
                `[STREAM ATTEMPT][${modo}] url=${maskMedia(candidate)} ua=${uaKind} core_status=${res.status} upstream=${upstreamStatus} ct=${res.headers.get("content-type") ?? "-"} worker=${coreWorkerVersion ?? "sem versão"} erro=${res.headers.get("X-Core-Error") ?? "-"} tempo=${Date.now() - t0}ms`
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
                  ? "Timeout de 15s ao chamar o Core AWS"
                  : `Falha de rede ao chamar o Core: ${(e as Error).message}`;
              tentativas.push({ modo, status: null, motivo: msg, ms: Date.now() - t0 });
            }
          }
        };

        // Escada de compatibilidade (sem fallback silencioso — tudo é reportado):
        // 1) Painel como navegador → 2) Painel como IPTV Smarters (muitos WAFs
        //    liberam só este UA) → 3) CORE-VLC → 4) CORE (UA Smarters)
        //    → 5) Painel como VLC.
        if (!forceCore) await tentarPainel("PAINEL", "browser");
        if (!upstream && !forceCore) await tentarPainel("PAINEL-SMARTERS", "player");
        if (!upstream) await tentarCore("CORE-VLC", "vlc");
        if (!upstream) await tentarCore("CORE", "player");
        if (!upstream && !forceCore) await tentarPainel("PAINEL-VLC", "vlc");

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
              "X-Playback-Reason": reason,
              "X-Core-Error": ultimo?.motivo ?? reason,
            },
          });
        }

        const upstreamType = found.headers.get("Content-Type");
        const isManifest = /mpegurl|m3u/i.test(upstreamType ?? "") || /\.m3u8(\?|$)/i.test(usedUrl);

        // Manifesto HLS → segmentos passam pelo mesmo modo que funcionou.
        if (isManifest) {
          const text = await found.text();
          const { manifest: rewritten, segmentos } = rewriteManifest(text, usedUrl, token, usedModo);
          console.log(
            `[STREAM RESPONSE] via=${usedModo} manifesto HLS bytes=${text.length} linhas=${text.split("\n").length} segmentos_reescritos=${segmentos}`
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
              "X-Playback-Reason": resumo || "OK",
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
        if (!out.has("Accept-Ranges") && type !== "live") out.set("Accept-Ranges", "bytes");

        // Diagnóstico de CODEC real: o arquivo é entregue (200/206), mas pode
        // conter H265/AC3/DTS que o navegador não decodifica
        // (DEMUXER_ERROR_NO_SUPPORTED_STREAMS). Só na primeira faixa do arquivo.
        const primeiraFaixa = !range || /^bytes=0-/.test(range);
        if (type !== "live" && primeiraFaixa) {
          const { probeCodecs } = await import("@/lib/codec-probe.server");
          const info = await probeCodecs(usedUrl, finalExt, usedModo.includes("VLC") ? UA_VLC : UA_PLAYER);
          if (info) {
            out.set("X-Playback-Codec-Video", info.video ?? "desconhecido");
            out.set("X-Playback-Codec-Audio", info.audio ?? "desconhecido");
            out.set("X-Playback-Action", info.action);
            if (!info.browserSupported && info.reason) {
              out.set("X-Playback-Incompatible", finalExt);
              out.set("X-Playback-Reason", info.reason);
            }
            console.log(
              `[CODEC] via=${usedModo} ext=${finalExt} video=${info.video ?? "?"} audio=${info.audio ?? "?"} suportado=${info.browserSupported} acao=${info.action}`
            );
          }
        }

        console.log(
          `[STREAM RESPONSE] via=${usedModo} type=${type} ext=${finalExt} status=${found.status} ct=${out.get("Content-Type")} range=${range ?? "none"} tentativas="${resumo}"`
        );

        return new Response(found.body, { status: found.status, headers: out });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
