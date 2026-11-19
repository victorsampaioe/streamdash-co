import { describe, expect, it, vi } from "vitest";
import { pullAndImportServerCredentialBatch, type PrivateMigrationEnv } from "./migration-private-source-pull.server";
import type { MigrationD1 } from "./migration-credential-import.server";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const base = {
  STREAMMONITOR_DATA_KEY_V1: key,
  MIGRATION_SOURCE_TOKEN: "synthetic-service-token",
  MIGRATION_SOURCE_URL: "https://migration.example.com/internal/export",
  MIGRATION_SOURCE_ALLOWED_HOST: "migration.example.com",
  PILOT_DB: { prepare: vi.fn(), batch: vi.fn() } as unknown as MigrationD1,
} satisfies PrivateMigrationEnv;
const source = (records: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ records }), {
  status: 200, headers: { "content-type": "application/json" },
})) as unknown as typeof fetch;
const record = {
  serverId: "synthetic-server-1", username: "synthetic-user",
  password: "synthetic-password", sourceSnapshotId: "synthetic-snapshot",
};
describe("private source pull", () => {
  it("rejects unauthorized use before network access", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportServerCredentialBatch(base, {
      authorized: false, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, fetcher)).rejects.toThrow("authorization");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("encrypts source data in memory without D1 writes during dry run", async () => {
    const fetcher = source([record]);
    const result = await pullAndImportServerCredentialBatch(base, {
      authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, fetcher);
    expect(result).toEqual({ processed: 1, persisted: false });
    expect(base.PILOT_DB.batch).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects insecure source URLs", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportServerCredentialBatch({
      ...base, MIGRATION_SOURCE_URL: "http://migration.example.com/export",
    }, { authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true }, fetcher))
      .rejects.toThrow("URL");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects mismatched snapshots without writes", async () => {
    await expect(pullAndImportServerCredentialBatch(base, {
      authorized: true, expectedSnapshot: "another-snapshot", dryRun: true,
    }, source([record]))).rejects.toThrow("metadata");
    expect(base.PILOT_DB.batch).not.toHaveBeenCalled();
  });
  it("rejects duplicate records", async () => {
    await expect(pullAndImportServerCredentialBatch(base, {
      authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true,
    }, source([record, record]))).rejects.toThrow("metadata");
  });
  it("rejects a different HTTPS hostname before sending the service token", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportServerCredentialBatch({
      ...base, MIGRATION_SOURCE_URL: "https://other.example.com/internal/export",
    }, { authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true }, fetcher))
      .rejects.toThrow("URL");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects missing pinned source hostname", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportServerCredentialBatch({
      ...base, MIGRATION_SOURCE_ALLOWED_HOST: undefined,
    }, { authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true }, fetcher))
      .rejects.toThrow("configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects missing private source token", async () => {
    const fetcher = source([record]);
    await expect(pullAndImportServerCredentialBatch({
      ...base, MIGRATION_SOURCE_TOKEN: undefined,
    }, { authorized: true, expectedSnapshot: "synthetic-snapshot", dryRun: true }, fetcher))
      .rejects.toThrow("configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
