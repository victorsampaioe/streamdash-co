/**
 * PRIVATE migration utility. Do not expose through public routes.
 * Only accepts already-encrypted envelopes; never handles plaintext.
 * The caller must authenticate an administrator and authorize a migration run.
 */
import {
  validateEncryptedCredentialBatch,
  type PreparedCredentialRow,
  type StagedServer,
} from "./migration-credential-batch.server";

type Statement = {
  bind(...values: (string | number | null)[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
export type MigrationD1 = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
};

const INSERT_SQL = `INSERT INTO migration_server_credentials_encrypted_stage
(server_id,username_ciphertext_b64,username_iv_b64,password_ciphertext_b64,password_iv_b64,algorithm,key_version,imported_at,source_snapshot_id)
VALUES(?,?,?,?,?,?,?,?,?)`;

export async function importEncryptedCredentialBatch(
  db: MigrationD1,
  rows: readonly PreparedCredentialRow[],
  authorized: boolean,
): Promise<{ imported: number; serverIds: string[] }> {
  if (!authorized) throw new Error("Migration authorization required");
  if (rows.length < 1 || rows.length > 100) throw new Error("Invalid batch size");
  const ids = rows.map((row) => row.server_id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate server identifier");
  const placeholders = ids.map(() => "?").join(",");
  const staged = await db.prepare(
    `SELECT server_id,credentials_present,source_snapshot_id FROM migration_servers_stage WHERE server_id IN (${placeholders})`,
  ).bind(...ids).all<StagedServer>();
  const validation = validateEncryptedCredentialBatch(rows, staged.results);
  const existing = await db.prepare(
    `SELECT server_id FROM migration_server_credentials_encrypted_stage WHERE server_id IN (${placeholders})`,
  ).bind(...ids).all<{ server_id: string }>();
  if (existing.results.length) throw new Error("Encrypted credentials already imported");
  const inserts = rows.map((row) => db.prepare(INSERT_SQL).bind(
    row.server_id,
    row.username_ciphertext_b64,
    row.username_iv_b64,
    row.password_ciphertext_b64,
    row.password_iv_b64,
    row.algorithm,
    row.key_version,
    row.imported_at,
    row.source_snapshot_id,
  ));
  // Cloudflare D1 batch executes these statements in one transaction.
  await db.batch(inserts);
  const verified = await db.prepare(
    `SELECT server_id FROM migration_server_credentials_encrypted_stage WHERE server_id IN (${placeholders})`,
  ).bind(...ids).all<{ server_id: string }>();
  if (verified.results.length !== validation.accepted) throw new Error("Import count mismatch");
  return { imported: validation.accepted, serverIds: validation.serverIds };
}
