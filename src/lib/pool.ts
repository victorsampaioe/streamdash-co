/**
 * Executor com limite de concorrência e jitter.
 * Evita rajadas simultâneas que fazem servidores monitorados bloquearem o IP
 * da VPS, mantendo o consumo de memória/soquetes previsível em produção.
 */
function envInt(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function monitorConcurrency(): number {
  return envInt("MONITOR_CONCURRENCY", 8);
}

export function monitorJitterMs(): number {
  return envInt("MONITOR_JITTER_MS", 250);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runPool<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  options?: { concurrency?: number; jitterMs?: number },
): Promise<PromiseSettledResult<R>[]> {
  const concurrency = Math.max(1, options?.concurrency ?? monitorConcurrency());
  const jitter = options?.jitterMs ?? monitorJitterMs();
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      if (jitter > 0) await sleep(Math.random() * jitter);
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });

  await Promise.all(lanes);
  return results;
}
