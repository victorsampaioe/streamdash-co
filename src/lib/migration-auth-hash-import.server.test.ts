import { describe, expect, it, vi } from "vitest";
import { importEncryptedAuthHashes, type AuthMigrationD1, type EncryptedAuthHashRow } from "./migration-auth-hash-import.server";
const b64 = (length: number, fill: number) => btoa(String.fromCharCode(...new Uint8Array(length).fill(fill)));
const row: EncryptedAuthHashRow = {
  user_id: "synthetic-user-1", ciphertext_b64: b64(76, 3), iv_b64: b64(12, 2),
  key_version: 1, algorithm: "AES-256-GCM", source_hash_algorithm: "bcrypt_2a",
  source_snapshot_id: "synthetic-snapshot", imported_at: "2026-11-19T13:00:00Z",
};
function mockDb({ account = true, existing = false, verify = true } = {}) {
  let written = false;
  const batch = vi.fn(async () => { written = true; return [{}]; });
  const prepare = vi.fn((sql: string) => ({
    bind: (..._values: unknown[]) => ({
      all: async () => ({
        results: sql.includes("FROM migration_auth_accounts_stage")
          ? (account ? [{ user_id: row.user_id, source_snapshot_id: row.source_snapshot_id }] : [])
          : sql.includes("FROM migration_auth_secret_envelopes")
            ? ((existing || (written && verify)) ? [{ user_id: row.user_id }] : [])
            : [],
      }),
    }),
  }));
  return { db: { prepare, batch } as unknown as AuthMigrationD1, prepare, batch };
}
describe("private encrypted auth hash import", () => {
  it("rejects unauthorized use before reading D1", async () => {
    const { db, prepare } = mockDb();
    await expect(importEncryptedAuthHashes(db,[row],false)).rejects.toThrow("authorization");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("imports synthetic encrypted envelope", async () => {
    const { db, batch } = mockDb();
    await expect(importEncryptedAuthHashes(db,[row],true)).resolves.toEqual({ imported: 1 });
    expect(batch).toHaveBeenCalledTimes(1);
  });
  it("rejects missing account", async () => {
    const { db, batch } = mockDb({ account: false });
    await expect(importEncryptedAuthHashes(db,[row],true)).rejects.toThrow("snapshot mismatch");
    expect(batch).not.toHaveBeenCalled();
  });
  it("rejects duplicate imports", async () => {
    const { db, batch } = mockDb({ existing: true });
    await expect(importEncryptedAuthHashes(db,[row],true)).rejects.toThrow("already imported");
    expect(batch).not.toHaveBeenCalled();
  });
  it("rejects invalid IV", async () => {
    const { db, batch } = mockDb();
    await expect(importEncryptedAuthHashes(db,[{ ...row, iv_b64: b64(8,2) }],true)).rejects.toThrow("ciphertext");
    expect(batch).not.toHaveBeenCalled();
  });
  it("rejects repeated user IDs", async () => {
    const { db, prepare } = mockDb();
    await expect(importEncryptedAuthHashes(db,[row,row],true)).rejects.toThrow("duplicate");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("detects missing verification rows", async () => {
    const { db } = mockDb({ verify: false });
    await expect(importEncryptedAuthHashes(db,[row],true)).rejects.toThrow("count mismatch");
  });
});
