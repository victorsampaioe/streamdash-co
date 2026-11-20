/** Shared, strict MAC validation for Stream Monitor's website and Telegram. */
export function normalizeActivationMac(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const text = value.trim().toUpperCase();
  const valid = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(text) ||
    /^([0-9A-F]{2}-){5}[0-9A-F]{2}$/.test(text) ||
    /^[0-9A-F]{12}$/.test(text);
  if (!valid) return null;
  const hex = text.replace(/[:-]/g, "");
  if (hex === "000000000000" || hex === "FFFFFFFFFFFF") return null;
  return hex.match(/.{2}/g)!.join(":");
}
export function isNormalizedActivationMac(value: unknown): value is string {
  return typeof value === "string" && normalizeActivationMac(value) === value;
}
