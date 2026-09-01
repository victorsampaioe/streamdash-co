/**
 * Classificação de delay (tempo de abertura do stream).
 * Limites centralizados — ajuste aqui para mudar em todo o produto.
 */
export type PerfTier = {
  key: "excellent" | "very_good" | "regular" | "slow" | "very_slow" | "unknown";
  label: string;
  emoji: string;
  /** classes tailwind com tokens semânticos */
  tone: string;
  maxMs: number;
};

export const PERF_TIERS: PerfTier[] = [
  { key: "excellent", label: "Excelente", emoji: "⚡", tone: "text-success", maxMs: 1000 },
  { key: "very_good", label: "Muito bom", emoji: "🟢", tone: "text-success", maxMs: 2000 },
  { key: "regular", label: "Regular", emoji: "🟡", tone: "text-warning", maxMs: 4000 },
  { key: "slow", label: "Lento", emoji: "🟠", tone: "text-warning", maxMs: 6000 },
  { key: "very_slow", label: "Muito lento", emoji: "🔴", tone: "text-destructive", maxMs: Infinity },
];

export const UNKNOWN_TIER: PerfTier = {
  key: "unknown",
  label: "Sem medições",
  emoji: "⚪",
  tone: "text-muted-foreground",
  maxMs: Infinity,
};

export function classifyDelay(openMs: number | null | undefined): PerfTier {
  if (openMs == null || !Number.isFinite(openMs)) return UNKNOWN_TIER;
  return PERF_TIERS.find((t) => openMs <= t.maxMs) ?? PERF_TIERS[PERF_TIERS.length - 1]!;
}

export function formatDelay(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatMs(ms: number | null | undefined): string {
  return ms == null ? "—" : `${ms} ms`;
}

/** Timeouts oficiais dos testes de performance. */
export const PERF_API_TIMEOUT_MS = 10_000;
export const PERF_STREAM_TIMEOUT_MS = 15_000;
/** Quantidade de canais amostrados por servidor (nunca varrer o catálogo). */
export const PERF_SAMPLE_SIZE = 3;
