/**
 * PRIVATE staging-only import of AES-256-GCM envelopes containing bcrypt hashes.
 * No plaintext hash, password, or key is accepted or logged by this module.
 * Caller must authenticate an operator, authorize the migration run, and supply
 * envelopes produced inside a trusted runtime using the same key version.
 */
export type EncryptedAuthHashRow = {
  user_id: string;
  ciphertext_b64: string;
  iv_b64: string;
  key_version: 1;
  algorithm: "AES-256-GCM";
  source_hash_algorithm: "bcrypt_2a";
  source_snapshot_id: string;
  imported_at: string;
};
type Statement = {
  bind(...values: (string | number | null)[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
};
export type AuthMigrationD1 = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
};
function validBase64(s: string): boolean {
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return false;
  try { return btoa(atob(s)) === s; } catch { return false; }
}
export async function importEncryptedAuthHashes(
  db: AuthMigrationD1,
  rows: readonly EncryptedAuthHashRow[],
  authorized: boolean,
): Promise<{ imported: number }> {
  if (!authorized) throw new Error("Migration authorization required");
  if (rows.length < 1 || rows.length > 100) throw new Error("Invalid batch size");
  const ids = rows.map(r => r.user_id);
  if (ids.some(id => !id || id.length > 256) || new Set(ids).size !== ids.length)
    throw new Error("Invalid or duplicate user identifier");
  const nonces = new Set<string>();
  for (const row of rows) {
    if (row.algorithm !== "AES-256-GCM" || row.key_version !== 1 || row.source_hash_algorithm !== "bcrypt_2a")
      throw new Error("Unsupported envelope");
    if (!validBase64(row.iv_b64) || atob(row.iv_b64).length !== 12 ||
        !validBase64(row.ciphertext_b64) || atob(row.ciphertext_b64).length < 16)
      throw new Error("Invalid ciphertext envelope");
    if (nonces.has(row.iv_b64)) throw new Error("Repeated encryption nonce");
    nonces.add(row.iv_b64);
    if (!row.source_snapshot_id || !Number.isFinite(Date.parse(row.imported_at)))
      throw new Error("Invalid source metadata");
  }
  const placeholders = ids.map(() => "?").join(",");
  const accounts = await db.prepare(
    `SELECT user_id,source_snapshot_id FROM migration_auth_accounts_stage WHERE user_id IN (${placeholders})`,
  ).bind(...ids).all<{ user_id: string; source_snapshot_id: string }>();
  const accountMap = new Map(accounts.results.map(a => [a.user_id, a.source_snapshot_id]));
  for (const row of rows) {
    if (accountMap.get(row.user_id) !== row.source_snapshot_id)
      throw new Error("Account not found or snapshot mismatch");
  }
  const existing = await db.prepare(
    `SELECT user_id FROM migration_auth_secret_envelopes WHERE user_id IN (${placeholders})`,
  ).bind(...ids).all<{ user_id: string }>();
  if (existing.results.length) throw new Error("Auth envelope already imported");
  await db.batch(rows.map(r => db.prepare(
    `INSERT INTO migration_auth_secret_envelopes
     (user_id,ciphertext_b64,iv_b64,key_version,algorithm,source_hash_algorithm,imported_at,source_snapshot_id)
     VALUES(?,?,?,?,?,?,?,?)`,
  ).bind(r.user_id,r.ciphertext_b64,r.iv_b64,r.key_version,r.algorithm,r.source_hash_algorithm,r.imported_at,r.source_snapshot_id)));
  const verified = await db.prepare(
    `SELECT user_id FROM migration_auth_secret_envelopes WHERE user_id IN (${placeholders})`,
  ).bind(...ids).all<{ user_id: string }>();
  if (verified.results.length !== rows.length) throw new Error("Auth import count mismatch");
  return { imported: rows.length };
}
