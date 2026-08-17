/**
 * Curadoria de conteúdo do Web Player — camada 100% visual/derivada.
 * Não busca dados novos, não altera reprodução: apenas ordena e filtra
 * o que o catálogo já entregou para destacar o que é relevante.
 */

export type Quality = "4K" | "FHD" | "HD" | "SD" | null;

const QUALITY_PATTERNS: Array<[Quality, RegExp]> = [
  ["4K", /\b(4k|2160p?|uhd)\b/i],
  ["FHD", /\b(fhd|full\s?hd|1080p?)\b/i],
  ["HD", /\b(hd|720p?)\b/i],
  ["SD", /\b(sd|480p?|360p?)\b/i],
];

export function detectQuality(item: any): Quality {
  const label = `${item?.name ?? item?.title ?? ""} ${item?.quality ?? ""}`;
  for (const [quality, pattern] of QUALITY_PATTERNS) {
    if (pattern.test(label)) return quality;
  }
  return null;
}

const QUALITY_SCORE: Record<string, number> = { "4K": 30, FHD: 22, HD: 14, SD: 0 };

export function getCover(item: any): string | null {
  return item?.backdrop_path?.[0] || item?.stream_icon || item?.cover || item?.series_icon || null;
}

export function getYear(item: any): number | null {
  const raw =
    item?.year ??
    item?.releaseDate ??
    item?.release_date ??
    item?.releasedate ??
    item?.added_date ??
    null;
  if (!raw) return null;
  const match = String(raw).match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

export function getRating(item: any): number {
  const raw = Number(item?.rating ?? item?.rating_5point ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // rating_5point vem em escala 0-5; rating do Xtream em 0-10.
  return raw <= 5 ? raw * 2 : raw;
}

function cleanTitle(item: any): string {
  return String(item?.name ?? item?.title ?? "").trim();
}

const GENERIC_TITLE = /^(cinema|filme|canal|conte[úu]do|teste|test|xxx|adulto)\b/i;

/** Item apto para o Hero: precisa de capa, título e alguma informação. */
export function isHeroWorthy(item: any): boolean {
  if (!item) return false;
  const title = cleanTitle(item);
  if (title.length < 3 || GENERIC_TITLE.test(title)) return false;
  if (!getCover(item)) return false;
  const year = getYear(item);
  const recentEnough = year === null ? false : year >= new Date().getFullYear() - 6;
  return recentEnough || getRating(item) >= 6.5;
}

/**
 * Score de relevância: lançamento recente + boa nota + qualidade alta.
 */
export function scoreItem(item: any): number {
  const currentYear = new Date().getFullYear();
  const year = getYear(item);
  const rating = getRating(item);
  const quality = detectQuality(item);

  let score = 0;
  if (year) score += Math.max(0, 40 - (currentYear - year) * 6);
  score += rating * 4;
  if (quality) score += QUALITY_SCORE[quality] ?? 0;
  if (getCover(item)) score += 10;
  if (item?.plot || item?.description) score += 5;
  if (item?.episode_count || item?.seasons?.length) score += 4;
  return score;
}

function dedupe(items: any[]): any[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item?.stream_id ?? item?.series_id ?? item?.id ?? cleanTitle(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Destaques do Hero — só conteúdo relevante, ordenado por score. */
export function curateHero(items: any[], limit = 5): any[] {
  const pool = dedupe((items || []).filter(isHeroWorthy));
  const ranked = pool.sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, limit);
  if (ranked.length > 0) return ranked;
  // Fallback: pelo menos exige capa para não mostrar hero vazio.
  return dedupe((items || []).filter((i) => getCover(i)))
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, limit);
}

/** Lançamentos em HD+ (ordenados por ano e qualidade). */
export function curateHdReleases(items: any[], limit = 20): any[] {
  return dedupe((items || []).filter((i) => getCover(i) && detectQuality(i) && detectQuality(i) !== "SD"))
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, limit);
}

/** Mais recentes por ano/adição. */
export function curateRecent(items: any[], limit = 20): any[] {
  return dedupe((items || []).filter((i) => getCover(i)))
    .sort((a, b) => (getYear(b) ?? 0) - (getYear(a) ?? 0) || scoreItem(b) - scoreItem(a))
    .slice(0, limit);
}

/** Melhor avaliados / mais assistidos (proxy por nota + qualidade). */
export function curateTopRated(items: any[], limit = 20): any[] {
  return dedupe((items || []).filter((i) => getCover(i) && getRating(i) > 0))
    .sort((a, b) => getRating(b) - getRating(a) || scoreItem(b) - scoreItem(a))
    .slice(0, limit);
}
