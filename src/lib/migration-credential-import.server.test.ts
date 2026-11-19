import { describe, expect, it, vi } from "vitest";
import { importEncryptedCredentialBatch, type MigrationD1 } from "./migration-credential-import.server";
import type { PreparedCredentialRow } from "./migration-credential-batch.server";

const iv1 = btoa(String.fromCharCode(...new Uint8Array(12).fill(1)));
const iv2 = btoa(String.fromCharCode(...new Uint8Array(12).fill(2)));
const ciphertext = btoa(String.fromCharCode(...new Uint8Array(24).fill(9)));
const row: PreparedCredentialRow = {
  server_id: "synthetic-server-1",
  username_ciphertext_b64: ciphertext,
  username_iv_b64: iv1,
  password_ciphertext_b64: ciphertext,
  password_iv_b64: iv2,
  algorithm: "AES-256-GCM",
  key_version: 1,
  imported_at: "2026-11-19T13:00:00Z",
  source_snapshot_id: "synthetic-snapshot",
};

function fakeDatabase(options: { eligible?: boolean; alreadyExists?: boolean; verified?: boolean } = {}) {
  const batch = vi.fn(async () => [{}]);
  const prepare = vi.fn((sql: string) => ({
    bind: (..._values: unknown[]) => ({
      all: async () => {
        if (sql.includes("FROM migration_servers_stage")) {
          return { results: options.eligible === false ? [] : [{
            server_id: row.server_id,
            credentials_present: 1,
            source_snapshot_id: row.source_snapshot_id,
          }] };
        }
        if (sql.includes("FROM migration_server_credentials_encrypted_stage")) {
          return { results: options.alreadyExists || (options.verified !== false && batch.mock.calls.length > 0)
            ? [{ server_id: row.server_id }] : [] };
        }
        return { results: [] };
      },
      run: async () => ({}),
    }),
  }));
  return { db: { prepare, batch } as unknown as MigrationD1, prepare, batch };
}

describe("private encrypted credential import", () => {
  it("rejects unauthorized requests without touching D1", async () => {
    const { db, prepare, batch } = fakeDatabase();
    await expect(importEncryptedCredentialBatch(db, [row], false)).rejects.toThrow("authorization");
    expect(prepare).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });
  it("imports valid synthetic ciphertext transactionally", async () => {
    const { db, batch } = fakeDatabase();
    await expect(importEncryptedCredentialBatch(db, [row], true)).resolves.toEqual({
      imported: 1, serverIds: ["synthetic-server-1"],
    });
    expect(batch).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown servers without writes", async () => {
    const { db, batch } = fakeDatabase({ eligible: false });
    await expect(importEncryptedCredentialBatch(db, [row], true)).rejects.toThrow();
    expect(batch).not.toHaveBeenCalled();
  });
  it("rejects previously imported servers without writes", async () => {
    const { db, batch } = fakeDatabase({ alreadyExists: true });
    await expect(importEncryptedCredentialBatch(db, [row], true)).rejects.toThrow("already imported");
    expect(batch).not.toHaveBeenCalled();
  });
  it("rejects duplicates before reading the database", async () => {
    const { db, prepare } = fakeDatabase();
    await expect(importEncryptedCredentialBatch(db, [row, row], true)).rejects.toThrow("Duplicate");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("reports missing post-import rows", async () => {
    const { db, batch } = fakeDatabase({ verified: false });
    await expect(importEncryptedCredentialBatch(db, [row], true)).rejects.toThrow("count mismatch");
    expect(batch).toHaveBeenCalledTimes(1);
  });
});
