/**
 * Server-only encryption for recoverable secrets (e.g. IPTV credentials).
 * Passwords must be hashed with a password KDF, NEVER encrypted with this helper.
 * Set STREAMMONITOR_DATA_KEY_V1 to a base64-encoded 32-byte secret in the
 * Cloudflare Worker secret store. Do not use VITE_ variables or commit the key.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export type SecretEnvelope = {
  algorithm: "AES-256-GCM";
  keyVersion: 1;
  iv: string;
  ciphertext: string;
};

export async function encryptSecret(
  plaintext: string,
  base64Key: string,
  recordId: string,
): Promise<SecretEnvelope> {
  if (!recordId) throw new Error("Missing record identifier");
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(recordId) },
    key,
    encoder.encode(plaintext),
  );
  return { algorithm: "AES-256-GCM", keyVersion: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptSecret(
  envelope: SecretEnvelope,
  base64Key: string,
  recordId: string,
): Promise<string> {
  if (envelope.algorithm !== "AES-256-GCM" || envelope.keyVersion !== 1) throw new Error("Unsupported envelope");
  if (!recordId) throw new Error("Missing record identifier");
  const iv = fromBase64(envelope.iv);
  if (iv.length !== 12) throw new Error("Invalid IV");
  const key = await importKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(recordId) },
    key,
    fromBase64(envelope.ciphertext),
  );
  return decoder.decode(plaintext);
}
