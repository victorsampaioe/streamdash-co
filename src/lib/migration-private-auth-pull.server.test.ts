import { describe, expect, it, vi } from "vitest";
import { pullAndImportAuthHashBatch, type AuthSourcePullEnv } from "./migration-private-auth-pull.server";
import type { AuthMigrationD1 } from "./migration-auth-hash-import.server";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
const bcryptHash = "$2a$10$" + "A".repeat(53);
const record = { userId: "synthetic-user-1", bcryptHash, sourceSnapshotId: "synthetic-snapshot" };
const base = {
  STREAMMONITOR_DATA_KEY_V1: key,
  MIGRATION_AUTH_SOURCE_TOKEN: "synthetic-private-token",
  MIGRATION_AUTH_SOURCE_URL: "https://auth-export.example.com/internal/export",
  MIGRATION_AUTH_SOURCE_ALLOWED_HOST: "auth-export.example.com",
  PILOT_DB: { prepare: vi.fn(), batch: vi.fn() } as unknown as AuthMigrationD1,
} satisfies AuthSourcePullEnv;
const source = (records: unknown[], contentType = "application/json") =>
  vi.fn(async () => new Response(JSON.stringify({ records }), {
    status: 200, headers: { "content-type": contentType },
  })) as unknown as typeof fetch;

describe("private auth source pull", () => {
  it("refuses unauthorized use without network access", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportAuthHashBatch(base, {
      authorized: false, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, fetcher)).rejects.toThrow("authorization");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("encrypts valid bcrypt hashes during dry run without storing anything", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportAuthHashBatch(base, {
      authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, fetcher)).resolves.toEqual({ processed: 1, persisted: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(base.PILOT_DB.batch).not.toHaveBeenCalled();
  });
  it("rejects a different source hostname before sending token", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportAuthHashBatch({
      ...base, MIGRATION_AUTH_SOURCE_URL: "https://other.example.com/export",
    }, { authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true }, fetcher))
      .rejects.toThrow("URL");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects missing allowlist before network access", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportAuthHashBatch({
      ...base, MIGRATION_AUTH_SOURCE_ALLOWED_HOST: undefined,
    }, { authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true }, fetcher))
      .rejects.toThrow("configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects invalid bcrypt hashes", async () => {
    await expect(pullAndImportAuthHashBatch(base, {
      authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, source([{ ...record, bcryptHash: "plaintext" }]))).rejects.toThrow("bcrypt");
    expect(base.PILOT_DB.batch).not.toHaveBeenCalled();
  });
  it("rejects snapshot mismatch and duplicates", async () => {
    await expect(pullAndImportAuthHashBatch(base, {
      authorized: true, expectedSnapshot: "other-snapshot", dryRun: true,
    }, source([record]))).rejects.toThrow("metadata");
    await expect(pullAndImportAuthHashBatch(base, {
      authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, source([record, record]))).rejects.toThrow("metadata");
  });
  it("rejects unexpected content type", async () => {
    await expect(pullAndImportAuthHashBatch(base, {
      authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, source([record], "text/html"))).rejects.toThrow("response");
  });
});
