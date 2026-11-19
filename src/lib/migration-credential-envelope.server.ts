/**
 * Staging-only preparation for migrating recoverable IPTV credentials.
 * This module does not read Lovable, write D1, or change production.
 * Call from a trusted Worker after source authorization and a dry run.
 */
import { encryptSecret, decryptSecret, type SecretEnvelope } from "./secret-envelope.server";

export type SourceServerCredential = {
  serverId: string;
  username: string | null;
  password: string | null;
};

export type EncryptedServerCredential = {
  server_id: string;
  username_ciphertext_b64: string | null;
  username_iv_b64: string | null;
  password_ciphertext_b64: string | null;
  password_iv_b64: string | null;
  algorithm: "AES-256-GCM";
  key_version: 1;
};

function validateId(serverId: string): void {
  if (!serverId || serverId.length > 256 || /[\u0000-\u001f]/.test(serverId)) {
    throw new Error("Invalid server identifier");
  }
}

function associatedData(serverId: string, field: "username" | "password"): string {
  return `streammonitor:migration:server:${serverId}:${field}:v1`;
}

/** Encrypts both fields independently with unique nonces and field-bound AAD. */
export async function prepareEncryptedServerCredential(
  source: SourceServerCredential,
  base64Key: string,
): Promise<EncryptedServerCredential> {
  validateId(source.serverId);
  if (source.username === null && source.password === null) {
    throw new Error("No credentials to encrypt");
  }
  const username = source.username === null ? null
    : await encryptSecret(source.username, base64Key, associatedData(source.serverId, "username"));
  const password = source.password === null ? null
    : await encryptSecret(source.password, base64Key, associatedData(source.serverId, "password"));
  return {
    server_id: source.serverId,
    username_ciphertext_b64: username?.ciphertext ?? null,
    username_iv_b64: username?.iv ?? null,
    password_ciphertext_b64: password?.ciphertext ?? null,
    password_iv_b64: password?.iv ?? null,
    algorithm: "AES-256-GCM",
    key_version: 1,
  };
}

/** A verification helper; do not return decrypted values to a client or logs. */
export async function verifyEncryptedServerCredential(
  source: SourceServerCredential,
  encrypted: EncryptedServerCredential,
  base64Key: string,
): Promise<boolean> {
  if (source.serverId !== encrypted.server_id) return false;
  for (const field of ["username", "password"] as const) {
    const plaintext = source[field];
    const ciphertext = encrypted[`${field}_ciphertext_b64`];
    const iv = encrypted[`${field}_iv_b64`];
    if (plaintext === null) {
      if (ciphertext !== null || iv !== null) return false;
      continue;
    }
    if (ciphertext === null || iv === null) return false;
    const envelope: SecretEnvelope = {
      algorithm: encrypted.algorithm,
      keyVersion: encrypted.key_version,
      iv,
      ciphertext,
    };
    const decrypted = await decryptSecret(
      envelope,
      base64Key,
      associatedData(source.serverId, field),
    );
    if (decrypted !== plaintext) return false;
  }
  return true;
}
