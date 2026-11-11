// Regras puras do Telegram Delivery Guard (testáveis sem banco).
export const OUTBOX_BACKOFF_SECONDS = [30, 120, 300, 900, 1800, 3600];

export function nextBackoffSeconds(attempts: number, retryAfter?: number | null): number {
  const base = OUTBOX_BACKOFF_SECONDS[Math.min(Math.max(attempts - 1, 0), OUTBOX_BACKOFF_SECONDS.length - 1)];
  return retryAfter && retryAfter > base ? retryAfter : base;
}

/** 400/401/403/404 do Telegram não melhoram com nova tentativa → dead letter. */
export function isPermanentTelegramError(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404;
}

export async function outboxKey(target: string, text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${target}\n${text}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
