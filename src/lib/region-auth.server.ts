import { createHmac, timingSafeEqual, createHash } from "node:crypto";

/** Reads the shared secret, tolerating stray whitespace/quotes from config UIs. */
export function getRegionSecret(): string | null {
  const raw = process.env.REGION_WORKER_SECRET;
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "");
  return cleaned.length ? cleaned : null;
}

/** Non-reversible fingerprint so both sides can be compared without leaking the secret. */
export function secretFingerprint(): string | null {
  const secret = getRegionSecret();
  if (!secret) return null;
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function verifyRegionSignature(message: string, signature: string | null): boolean {
  const secret = getRegionSecret();
  if (!secret || !signature) return false;
  const given = signature.trim().toLowerCase().replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
