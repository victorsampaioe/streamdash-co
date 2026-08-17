/**
 * Teste de carga progressivo do proxy de stream (Etapas 1 + 3).
 *
 * Uso:
 *   node scripts/loadtest-stream.mjs "<URL_ASSINADA_DO_MANIFESTO>" [50,100,200,500] [segundos]
 *
 * A URL deve ser uma URL assinada (sig/exp) gerada pelo player — nunca a URL
 * do painel Xtream. O script simula clientes HLS: baixa o manifesto e, em
 * seguida, os últimos segmentos, em loop, medindo:
 *   - taxa de erro do manifesto e dos segmentos
 *   - latência p50/p95 por segmento
 *   - throughput agregado (Mbps)
 *   - acerto de cache (X-Core-Cache / cf-cache-status)
 */

const url = process.argv[2];
const levels = (process.argv[3] ?? "50,100,200,500").split(",").map(Number);
const holdSeconds = Number(process.argv[4] ?? 60);

if (!url) {
  console.error("Informe a URL assinada do manifesto .m3u8");
  process.exit(1);
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function virtualViewer(stop, m) {
  while (!stop.done) {
    try {
      const t0 = Date.now();
      const man = await fetch(url, { headers: { "user-agent": "loadtest-hls" } });
      m.manifest.total++;
      if (!man.ok) {
        m.manifest.errors++;
        m.reasons.add(`manifesto HTTP ${man.status} ${man.headers.get("x-core-error") ?? ""}`.trim());
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const body = await man.text();
      m.manifestLat.push(Date.now() - t0);

      const segs = body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .slice(-3);

      for (const seg of segs) {
        if (stop.done) break;
        const s0 = Date.now();
        const abs = new URL(seg, url).toString();
        const res = await fetch(abs, { headers: { "user-agent": "loadtest-hls" } });
        m.segment.total++;
        if (!res.ok) {
          m.segment.errors++;
          m.reasons.add(`segmento HTTP ${res.status} ${res.headers.get("x-core-error") ?? ""}`.trim());
          continue;
        }
        const buf = await res.arrayBuffer();
        m.bytes += buf.byteLength;
        m.segLat.push(Date.now() - s0);
        const cache = res.headers.get("cf-cache-status") ?? res.headers.get("x-core-cache");
        if (cache && /hit|segment-ttl/i.test(cache)) m.cacheHits++;
      }
    } catch (e) {
      m.segment.total++;
      m.segment.errors++;
      m.reasons.add(String(e?.message ?? e).slice(0, 120));
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

for (const users of levels) {
  const m = {
    manifest: { total: 0, errors: 0 },
    segment: { total: 0, errors: 0 },
    manifestLat: [],
    segLat: [],
    bytes: 0,
    cacheHits: 0,
    reasons: new Set(),
  };
  const stop = { done: false };
  const started = Date.now();
  console.log(`\n=== Patamar: ${users} usuários simultâneos por ${holdSeconds}s ===`);
  const viewers = Array.from({ length: users }, () => virtualViewer(stop, m));
  await new Promise((r) => setTimeout(r, holdSeconds * 1000));
  stop.done = true;
  await Promise.allSettled(viewers);

  const elapsed = (Date.now() - started) / 1000;
  const mbps = (m.bytes * 8) / elapsed / 1e6;
  const segErrRate = m.segment.total ? (m.segment.errors / m.segment.total) * 100 : 0;
  console.log(
    JSON.stringify(
      {
        usuarios: users,
        manifesto: { total: m.manifest.total, erros: m.manifest.errors, p95_ms: pct(m.manifestLat, 95) },
        segmentos: {
          total: m.segment.total,
          erros: m.segment.errors,
          taxa_erro_pct: Number(segErrRate.toFixed(2)),
          p50_ms: pct(m.segLat, 50),
          p95_ms: pct(m.segLat, 95),
        },
        throughput_mbps: Number(mbps.toFixed(1)),
        cache_hit_pct: m.segment.total
          ? Number(((m.cacheHits / m.segment.total) * 100).toFixed(1))
          : 0,
        motivos: [...m.reasons].slice(0, 5),
      },
      null,
      2,
    ),
  );
}
