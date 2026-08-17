/**
 * Etapa 3 — decisão de cache compartilhado (CDN) para o proxy de stream.
 *
 * Regras (conservadoras por design):
 * - só segmentos de TV ao vivo (.ts/.m4s) entram em cache compartilhado;
 * - manifesto (.m3u8) nunca é cacheado (playlist ao vivo precisa girar);
 * - VOD (filme/série) mantém o comportamento atual, inclusive Range/206;
 * - erro, 401/403 ou qualquer resposta não-200 nunca é cacheada;
 * - desligado por padrão (HLS_SEGMENT_CACHE !== "on") → rollback imediato.
 */
export type CacheDecision = { cacheControl: string; hitHeader?: string };

export function segmentCacheDecision(input: {
  type: string;
  ext: string;
  isHlsManifest: boolean;
  status: number;
  hasRange: boolean;
  enabled: boolean;
  ttlSeconds: number;
}): CacheDecision | null {
  const isLiveSegment =
    input.type === "live" && !input.isHlsManifest && (input.ext === "ts" || input.ext === "m4s");
  if (!isLiveSegment) return null;
  if (!input.enabled) return null;
  if (input.status !== 200) return null;
  if (input.hasRange) return null;

  const ttl = Math.max(1, Math.min(60, Number.isFinite(input.ttlSeconds) ? input.ttlSeconds : 15));
  return { cacheControl: `public, max-age=${ttl}, s-maxage=${ttl}`, hitHeader: `segment-ttl-${ttl}` };
}

export function readSegmentCacheEnv() {
  return {
    enabled: process.env.HLS_SEGMENT_CACHE === "on",
    ttlSeconds: Number(process.env.HLS_CACHE_TTL_SECONDS ?? 15),
  };
}
