/**
 * Migration-only wrapping of EXISTING bcrypt password hashes.
 * Passwords themselves are never encrypted or handled here.
 * Decrypted bcrypt hashes must be verified with a password hashing library
 * in a trusted authentication runtime; never return them to a browser.
 */
import { encryptSecret, decryptSecret, type SecretEnvelope } from "./secret-envelope.server";

export function authHashAssociatedData(userId: string): string {
  if (!userId || userId.length > 256 || /[\u0000-\u001f]/.test(userId))
    throw new Error("Invalid auth account identifier");
  return `streammonitor:migration:auth-hash:${userId}:v1`;
}

export function isSupportedBcryptHash(hash: string): boolean {
  return /^\$2a\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(hash);
}

export async function encryptExistingBcryptHash(
  userId: string,
  bcryptHash: string,
  base64Key: string,
): Promise<SecretEnvelope> {
  if (!isSupportedBcryptHash(bcryptHash)) throw new Error("Unsupported source bcrypt hash");
  return encryptSecret(bcryptHash, base64Key, authHashAssociatedData(userId));
}

export async function verifyEncryptedBcryptHash(
  userId: string,
  sourceHash: string,
  envelope: SecretEnvelope,
  base64Key: string,
): Promise<boolean> {
  if (!isSupportedBcryptHash(sourceHash)) return false;
  const unwrapped = await decryptSecret(envelope, base64Key, authHashAssociatedData(userId));
  return unwrapped === sourceHash;
}
