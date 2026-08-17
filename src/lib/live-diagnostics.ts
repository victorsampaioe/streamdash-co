/**
 * DIAGNÓSTICO TEMPORÁRIO — SOMENTE TV AO VIVO (live).
 *
 * Objetivo: comparar servidores que funcionam (ex.: TVS) com servidores que
 * falham, respondendo: a falha está no manifesto, nos segmentos, nos headers
 * ou é bloqueio da origem?
 *
 * Nada aqui altera a lógica de reprodução. É só observabilidade.
 * Para remover: apagar este arquivo e as chamadas `logLiveManifest` /
 * `logLiveSegment` / `liveDiagSnapshot` em stream.ts.
 */

export const LIVE_DIAG_VERSION = "2026.08.17-livediag-v1";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "desconhecido";
  }
}

function maskLive(url: string) {
  return url.replace(/\/\/([^/]+)\/(live|movie|series)\/[^/]+\/[^/]+\//, "//$1/$2/***/***/");
}

/** Extrai contagem e primeiro segmento de um manifesto HLS (antes da reescrita). */
export function inspectManifest(manifest: string, baseUrl: string) {
  const lines = manifest.split("\n").map((l) => l.trim());
  const uris: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-MEDIA:")) {
      const m = line.match(/URI="([^"]+)"/);
      if (m) uris.push(m[1]);
      continue;
    }
    if (!line.startsWith("#")) uris.push(line);
  }
  const isMaster = /#EXT-X-STREAM-INF/i.test(manifest);
  let first = uris[0] ?? null;
  let firstAbs: string | null = null;
  if (first) {
    try {
      firstAbs = new URL(first, baseUrl).toString();
    } catch {
      firstAbs = first;
    }
  }
  return {
    total: uris.length,
    isMaster,
    firstSegmentRaw: first,
    firstSegmentAbs: firstAbs,
    hasEndlist: /#EXT-X-ENDLIST/.test(manifest),
    targetDuration: manifest.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1] ?? null,
  };
}

type HostDiag = {
  host: string;
  ultimoManifesto: {
    url: string;
    status: number;
    contentType: string;
    ua: string;
    modo: string;
    segmentos: number;
    isMaster: boolean;
    primeiroSegmento: string | null;
    bytes: number;
    em: string;
  } | null;
  ultimoSegmento: {
    url: string;
    status: number;
    contentType: string;
    ua: string;
    ms: number;
    bytes: string;
    erro?: string;
    em: string;
  } | null;
  manifestosOk: number;
  manifestosFalha: number;
  segmentosOk: number;
  segmentosFalha: number;
};

const registry = new Map<string, HostDiag>();

function slot(host: string): HostDiag {
  let d = registry.get(host);
  if (!d) {
    d = {
      host,
      ultimoManifesto: null,
      ultimoSegmento: null,
      manifestosOk: 0,
      manifestosFalha: 0,
      segmentosOk: 0,
      segmentosFalha: 0,
    };
    registry.set(host, d);
  }
  return d;
}

export function logLiveManifest(args: {
  url: string;
  finalUrl?: string;
  status: number;
  contentType: string | null;
  ua: string;
  modo: string;
  body: string;
}) {
  const info = inspectManifest(args.body, args.finalUrl || args.url);
  const host = hostOf(args.finalUrl || args.url);
  const d = slot(host);
  const ok = args.status >= 200 && args.status < 300 && info.total > 0;
  ok ? (d.manifestosOk += 1) : (d.manifestosFalha += 1);
  d.ultimoManifesto = {
    url: maskLive(args.url),
    status: args.status,
    contentType: args.contentType ?? "-",
    ua: args.ua,
    modo: args.modo,
    segmentos: info.total,
    isMaster: info.isMaster,
    primeiroSegmento: info.firstSegmentAbs ? maskLive(info.firstSegmentAbs) : null,
    bytes: args.body.length,
    em: new Date().toISOString(),
  };

  console.log(
    `[LIVE DIAG][MANIFESTO] host=${host}
- URL m3u8 original: ${maskLive(args.url)}
- URL final (pós-redirect): ${maskLive(args.finalUrl || args.url)}
- Status do manifesto: ${args.status}
- Content-Type: ${args.contentType ?? "-"}
- User-Agent usado: ${args.ua}
- Modo: ${args.modo}
- Tipo: ${info.isMaster ? "MASTER (variantes)" : "MEDIA (segmentos)"}
- Segmentos encontrados: ${info.total}
- TARGETDURATION: ${info.targetDuration ?? "-"} | ENDLIST: ${info.hasEndlist}
- Primeiro segmento: ${info.firstSegmentAbs ? maskLive(info.firstSegmentAbs) : "NENHUM"}
- Bytes do manifesto: ${args.body.length}
- Veredito parcial: ${
      args.status >= 400
        ? "FALHA NO MANIFESTO (bloqueio/erro da origem)"
        : info.total === 0
          ? "MANIFESTO VAZIO (origem devolveu playlist sem segmentos)"
          : "MANIFESTO OK"
    }`
  );
  return info;
}

export function logLiveSegment(args: {
  url: string;
  status: number;
  contentType: string | null;
  contentLength?: string | null;
  ua: string;
  ms: number;
  erro?: string;
}) {
  const host = hostOf(args.url);
  const d = slot(host);
  const ok = args.status >= 200 && args.status < 400 && !args.erro;
  ok ? (d.segmentosOk += 1) : (d.segmentosFalha += 1);
  d.ultimoSegmento = {
    url: maskLive(args.url),
    status: args.status,
    contentType: args.contentType ?? "-",
    ua: args.ua,
    ms: args.ms,
    bytes: args.contentLength ?? "-",
    erro: args.erro,
    em: new Date().toISOString(),
  };

  console.log(
    `[LIVE DIAG][SEGMENTO] host=${host} status=${args.status} content-type=${args.contentType ?? "-"} bytes=${
      args.contentLength ?? "-"
    } ua=${args.ua} tempo=${args.ms}ms url=${maskLive(args.url)}${args.erro ? ` erro="${args.erro}"` : ""}
- Veredito parcial: ${
      args.erro
        ? "FALHA DE REDE NO SEGMENTO"
        : args.status >= 400
          ? "SEGMENTO BLOQUEADO PELA ORIGEM"
          : "SEGMENTO OK"
    }`
  );
}

/** Snapshot comparativo entre hosts (servidor que funciona x que falha). */
export function liveDiagSnapshot() {
  return {
    version: LIVE_DIAG_VERSION,
    geradoEm: new Date().toISOString(),
    hosts: [...registry.values()].map((d) => ({
      ...d,
      veredito: !d.ultimoManifesto
        ? "sem dados de manifesto"
        : d.ultimoManifesto.status >= 400
          ? "bloqueio/erro no manifesto"
          : d.ultimoManifesto.segmentos === 0
            ? "manifesto sem segmentos"
            : d.segmentosFalha > 0 && d.segmentosOk === 0
              ? "manifesto ok, segmentos bloqueados"
              : "fluxo ok",
    })),
  };
}
