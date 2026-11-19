/**
 * Private Worker-only migration orchestrator. Never export as a public route.
 * The source must expose a trusted HTTPS endpoint restricted to a migration
 * service token. Plaintext source credentials are handled only in Worker memory.
 * Do not log, return, or persist the source payload.
 */
import { prepareEncryptedServerCredential, type SourceServerCredential } from "./migration-credential-envelope.server";
import { importEncryptedCredentialBatch, type MigrationD1 } from "./migration-credential-import.server";
import type { PreparedCredentialRow } from "./migration-credential-batch.server";

export type PrivateMigrationEnv = {
  PILOT_DB: MigrationD1;
  STREAMMONITOR_DATA_KEY_V1: string;
  MIGRATION_SOURCE_TOKEN?: string;
  MIGRATION_SOURCE_URL?: string;
  /** Separately configured exact host allowlist; never infer from source URL. */
  MIGRATION_SOURCE_ALLOWED_HOST?: string;
};

type SourceRow = SourceServerCredential & { sourceSnapshotId: string };
type SourceResponse = { records: SourceRow[] };

function sourceUrl(value: string, allowedHost: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !allowedHost || url.hostname !== allowedHost || !/^[a-z0-9.-]+$/.test(allowedHost) ||
      !url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname) ||
      url.hostname === "::1" || url.hostname.startsWith("172.")) {
    throw new Error("Invalid migration source URL");
  }
  return url;
}

/**
 * Call only after a separate, audited operator authorization. The caller
 * controls batch ID and dry-run state; this function never enables cutover.
 */
export async function pullAndImportServerCredentialBatch(
  env: PrivateMigrationEnv,
  options: { authorized: boolean; expectedSnapshot: string; dryRun: boolean },
  fetchSource: typeof fetch = fetch,
): Promise<{ processed: number; persisted: boolean }> {
  if (!options.authorized) throw new Error("Migration authorization required");
  if (!options.expectedSnapshot || !env.MIGRATION_SOURCE_TOKEN || !env.MIGRATION_SOURCE_URL ||
      !env.MIGRATION_SOURCE_ALLOWED_HOST ||
      !env.STREAMMONITOR_DATA_KEY_V1) throw new Error("Private migration configuration incomplete");
  const url = sourceUrl(env.MIGRATION_SOURCE_URL, env.MIGRATION_SOURCE_ALLOWED_HOST);
  const response = await fetchSource(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.MIGRATION_SOURCE_TOKEN}`,
      Accept: "application/json",
      "Cache-Control": "no-store",
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Migration source request failed");
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || ""))
    throw new Error("Invalid migration source content type");
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > 512_000) throw new Error("Migration source response too large");
  const body = await response.text();
  if (body.length > 512_000) throw new Error("Migration source response too large");
  let parsed: SourceResponse;
  try { parsed = JSON.parse(body) as SourceResponse; }
  catch { throw new Error("Invalid migration source response"); }
  if (!parsed || !Array.isArray(parsed.records) || parsed.records.length < 1 || parsed.records.length > 100)
    throw new Error("Invalid migration batch size");
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const rows: PreparedCredentialRow[] = [];
  for (const item of parsed.records) {
    if (!item || typeof item.serverId !== "string" || seen.has(item.serverId) ||
        item.sourceSnapshotId !== options.expectedSnapshot ||
        (item.username !== null && typeof item.username !== "string") ||
        (item.password !== null && typeof item.password !== "string")) {
      throw new Error("Invalid source credential metadata");
    }
    seen.add(item.serverId);
    const encrypted = await prepareEncryptedServerCredential(
      { serverId: item.serverId, username: item.username, password: item.password },
      env.STREAMMONITOR_DATA_KEY_V1,
    );
    rows.push({ ...encrypted, source_snapshot_id: item.sourceSnapshotId, imported_at: now });
  }
  if (options.dryRun) return { processed: rows.length, persisted: false };
  const result = await importEncryptedCredentialBatch(env.PILOT_DB, rows, true);
  return { processed: result.imported, persisted: true };
}
