#!/usr/bin/env node
/**
 * Validação real do Worker AWS (Core Stream) após o deploy.
 *
 * Uso:
 *   CRON_SECRET=xxxx CORE_API_URL=https://core.streammonitor.site \
 *   node scripts/verify-core-stream.mjs "<URL_LIVE_M3U8>" "<URL_FILME_MP4>" "<URL_EPISODIO_MP4>"
 *
 * Cada URL é a URL final do painel Xtream (live/movie/series).
 * Saída: via / status / Content-Type / Range / tempo / resultado.
 */
import { createHmac } from "node:crypto";

const base = (process.env.CORE_API_URL || "https://core.streammonitor.site").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";
if (!secret) {
  console.error("CRON_SECRET ausente. Exporte o mesmo valor usado no Painel e na EC2.");
  process.exit(1);
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");

function relayUrl(target, type, ext) {
  const exp = Math.floor(Date.now() / 1000) + 300;
  const sig = createHmac("sha256", secret).update(`${target}|${exp}`).digest("hex");
  const u = new URL(`${base}/api/public/core/stream`);
  u.searchParams.set("u", b64(target));
  u.searchParams.set("exp", String(exp));
  u.searchParams.set("sig", sig);
  u.searchParams.set("type", type);
  u.searchParams.set("ext", ext);
  u.searchParams.set("via", "core");
  return u.toString();
}

async function health() {
  const res = await fetch(`${base}/api/public/health`);
  const body = await res.json();
  console.log("HEALTH", JSON.stringify(body));
  if (!body.streamVersion) {
    console.error("→ Worker AWS DESATUALIZADO: sem 'streamVersion'. Rode o deploy antes de testar.");
  }
  return body;
}

async function probe(label, target, type, ext, range) {
  const url = relayUrl(target, type, ext);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: range ? { Range: range } : {} });
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type");
    const cr = res.headers.get("content-range");
    let extra = "";
    if (/mpegurl|m3u/i.test(ct || "")) {
      const text = await res.text();
      extra = ` segmentos=${(text.match(/^[^#\n].+$/gm) || []).length}`;
    } else {
      await res.body?.cancel();
    }
    const ok = res.status === 200 || res.status === 206;
    console.log(
      [
        `--- ${label}`,
        `via: CORE`,
        `status: ${res.status}`,
        `Content-Type: ${ct ?? "-"}`,
        `Range: ${range ?? "none"} → ${cr ?? "-"}`,
        `tempo: ${ms}ms`,
        `worker: ${res.headers.get("x-core-stream-version") ?? "DESATUALIZADO"}`,
        `erro: ${res.headers.get("x-core-error") ?? res.headers.get("x-playback-reason") ?? "-"}`,
        `resultado: ${ok ? "OK" : "FALHOU"}${extra}`,
      ].join("\n"),
    );
  } catch (e) {
    console.log(`--- ${label}\nvia: CORE\nresultado: FALHOU\nerro: ${e.message}`);
  }
}

const [live, movie, episode] = process.argv.slice(2);
await health();
if (live) await probe("TV AO VIVO", live, "live", "m3u8");
if (movie) await probe("FILME", movie, "movie", "mp4", "bytes=0-1048575");
if (episode) await probe("SÉRIE (episódio)", episode, "series", "mp4", "bytes=0-1048575");
if (!live && !movie && !episode) console.log("Informe as URLs de teste (live, filme, episódio).");
