/**
 * Staging-only, trusted Worker-to-source migration of existing bcrypt hashes.
 * Never expose this function through an HTTP route or log source payloads.
 * The source endpoint must be independently authenticated and restricted.
 */
import { encryptExistingBcryptHash } from "./migration-auth-hash-envelope.server";
import { importEncryptedAuthHashes, type AuthMigrationD1, type EncryptedAuthHashRow } from "./migration-auth-hash-import.server";

export type AuthSourcePullEnv = {
  PILOT_DB: AuthMigrationD1;
  STREAMMONITOR_DATA_KEY_V1: string;
  MIGRATION_AUTH_SOURCE_URL?: string;
  MIGRATION_AUTH_SOURCE_TOKEN?: string;
  MIGRATION_AUTH_SOURCE_ALLOWED_HOST?: string;
};

export async function pullAndImportAuthHashBatch(
  env: AuthSourcePullEnv,
  options: { authorized: boolean; expectedSnapshot: string; dryRun: boolean },
  fetchSource: typeof fetch = fetch,
): Promise<{ processed: number; persisted: boolean }> {
  if (!options.authorized) throw new Error("Migration authorization required");
  const { MIGRATION_AUTH_SOURCE_URL: source, MIGRATION_AUTH_SOURCE_TOKEN: token,
    MIGRATION_AUTH_SOURCE_ALLOWED_HOST: allowedHost, STREAMMONITOR_DATA_KEY_V1: key } = env;
  if (!source || !token || !allowedHost || !key || !options.expectedSnapshot)
    throw new Error("Private auth migration configuration incomplete");
  const url = new URL(source);
  if (url.protocol !== "https:" || url.hostname !== allowedHost ||
      !/^[a-z0-9.-]+$/.test(allowedHost) || url.port || url.username || url.password ||
      url.search || url.hash || url.hostname === "localhost" ||
      /^(?:0\.|10\.|127\.|169\.254\.|172\.|192\.168\.)/.test(url.hostname))
    throw new Error("Invalid private auth source URL");
  const response = await fetchSource(url.toString(), {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Cache-Control": "no-store" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || ""))
    throw new Error("Invalid private auth source response");
  if (Number(response.headers.get("content-length") || 0) > 512000)
    throw new Error("Private auth source response too large");
  const body = await response.text();
  if (body.length > 512000) throw new Error("Private auth source response too large");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error("Invalid private auth source JSON"); }
  if (!parsed || typeof parsed !== "object" || !("records" in parsed) ||
      !Array.isArray(parsed.records) || parsed.records.length < 1 || parsed.records.length > 100)
    throw new Error("Invalid private auth batch size");
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const rows: EncryptedAuthHashRow[] = [];
  for (const item of parsed.records) {
    if (!item || typeof item.userId !== "string" || seen.has(item.userId) ||
        item.sourceSnapshotId !== options.expectedSnapshot || typeof item.bcryptHash !== "string")
      throw new Error("Invalid private auth row metadata");
    seen.add(item.userId);
    const envelope = await encryptExistingBcryptHash(item.userId, item.bcryptHash, key);
    rows.push({
      user_id: item.userId, ciphertext_b64: envelope.ciphertext,
      iv_b64: envelope.iv, key_version: 1, algorithm: "AES-256-GCM",
      source_hash_algorithm: "bcrypt_2a", source_snapshot_id: item.sourceSnapshotId,
      imported_at: now,
    });
  }
  if (options.dryRun) return { processed: rows.length, persisted: false };
  const result = await importEncryptedAuthHashes(env.PILOT_DB, rows, true);
  return { processed: result.imported, persisted: true };
}
