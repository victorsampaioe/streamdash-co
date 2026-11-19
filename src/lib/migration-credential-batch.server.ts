/**
 * Isolated staging import validation.
 * Never expose this function as a public endpoint. It accepts encrypted
 * envelopes only, and cannot decrypt or fetch source credentials.
 */
import type { EncryptedServerCredential } from "./migration-credential-envelope.server";

export type StagedServer = {
  server_id: string;
  credentials_present: number;
  source_snapshot_id: string;
};

export type PreparedCredentialRow = EncryptedServerCredential & {
  source_snapshot_id: string;
  imported_at: string;
};

const b64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isValidBase64(value: string): boolean {
  if (value.length % 4 !== 0 || !b64.test(value)) return false;
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

function checkField(ciphertext: string | null, iv: string | null): boolean {
  if ((ciphertext === null) !== (iv === null)) return false;
  if (ciphertext === null || iv === null) return true;
  // AES-GCM ciphertext includes a 16-byte authentication tag.
  return isValidBase64(iv) && atob(iv).length === 12
    && isValidBase64(ciphertext) && atob(ciphertext).length >= 16;
}

/** Fail closed before any staging database write. */
export function validateEncryptedCredentialBatch(
  rows: readonly PreparedCredentialRow[],
  stagedServers: readonly StagedServer[],
): { accepted: number; serverIds: string[] } {
  if (!rows.length || rows.length > 100) throw new Error("Batch size must be between 1 and 100");
  const servers = new Map(stagedServers.map((server) => [server.server_id, server]));
  const seen = new Set<string>();
  const nonces = new Set<string>();
  for (const row of rows) {
    if (!row.server_id || seen.has(row.server_id)) throw new Error("Duplicate or missing server identifier");
    seen.add(row.server_id);
    const server = servers.get(row.server_id);
    if (!server || server.credentials_present !== 1 || server.source_snapshot_id !== row.source_snapshot_id) {
      throw new Error("Server is missing, does not require credentials, or snapshot mismatches");
    }
    if (row.algorithm !== "AES-256-GCM" || row.key_version !== 1) throw new Error("Unsupported encryption envelope");
    if (!checkField(row.username_ciphertext_b64, row.username_iv_b64)
      || !checkField(row.password_ciphertext_b64, row.password_iv_b64)) {
      throw new Error("Invalid encrypted field format");
    }
    if (row.username_ciphertext_b64 === null && row.password_ciphertext_b64 === null) {
      throw new Error("Empty encrypted credentials");
    }
    for (const iv of [row.username_iv_b64, row.password_iv_b64]) {
      if (iv === null) continue;
      if (nonces.has(iv)) throw new Error("Repeated encryption nonce in batch");
      nonces.add(iv);
    }
    if (!Number.isFinite(Date.parse(row.imported_at))) throw new Error("Invalid import timestamp");
  }
  return { accepted: rows.length, serverIds: [...seen] };
}
