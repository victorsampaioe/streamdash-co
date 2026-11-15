# Stream Monitor — Cloudflare migration backup gate

## Estado (15 November 2026)
Source remains **Lovable Cloud PostgreSQL**, operational and unchanged. Do **not** switch production reads, writes, authentication, payment callbacks, DNS workers, or Telegram jobs to D1 yet.

Cloudflare D1 isolated databases already created:
- `streammonitor-migration-pilot`: inventories and fictitious health sample only.
- `streammonitor-restore-lab`: Time Travel restoration tested with fictitious data.

The pilot includes `migration_readiness` statuses. The local backup **byte count and SHA-256 calculation passed**, while the complete PostgreSQL recovery, independent Storage objects backup, and production cutover remain **blocked**. The export exists in private Lovable Cloud Storage and in the owner's local computer; availability is not proof of restorability.

**Cloudflare staging Worker:** `streammonitor-migration-sandbox` binds only the pilot D1 database and reads exclusively synthetic monitoring data. Its `/health` and `/demo/status` endpoints passed real HTTP checks on the temporary workers.dev address. The public subdomain was disabled immediately after testing. The Worker has no cron trigger or route on `streammonitor.site`. Reproducible source: `cloudflare/migration-sandbox/`.

## Critical migration gates (ALL must pass)
1. Official Lovable Cloud export obtained and downloaded privately. **Still verify archive structure, scope (including `auth`, SQL objects, rows and policies) and restore integrity** in an isolated PostgreSQL environment.
2. Export **Storage objects separately**, including bucket configuration and policies; don't assume database export includes files.
3. The local SHA-256 computation succeeded, but a second encrypted or independently access-restricted copy of the backup **must still be verified** outside the source project.
4. Restore into an **isolated PostgreSQL environment** (never the live database); validate schema, auth account count, login mechanism, RLS, financial balances, credits, FK integrity, payment & subscription records, and recoverability.
5. Re-create non-database dependencies intentionally: secrets without printing or committing values, queue and cron delivery, auth provider config, webhooks, file ACL, R2 and audit logs.
6. Run dual-read reconciliation for technical tables, then request explicit user sign-off before any financial data movement or production cutover.

## What is known
- Source PostgreSQL 17.6, approx. 5.95 GB including indexes.
- 141 public tables, 148 public functions, 54 public triggers, 212 RLS policies, 17 active cron jobs, three private Storage buckets.
- Cloudflare D1 uses SQLite semantics; **Postgres role policies, extensions, triggers, functions and Auth do not migrate by directly copying tables**.
- Source has Supabase Auth, pg_cron, pg_net, pgcrypto, Supabase Vault and Storage; keep source running throughout staged migration.
- At last inventory the Storage had 25 files in `promo-arts` (~43.6 MB); other two buckets had zero. Re-check before export.
- The owner successfully initiated the official export via the Lovable UI. The Lovable connector still only supports SQL queries, not private Storage backup download. The user elected to keep full backup bytes local. **Do not use a production data SELECT loop as a substitute for an auditable, restorable backup**.

## Secret handling (public repository!)
NEVER commit customer data, password hashes, exports, private Storage images, tokens, wallets, payment records, dumps, connection strings, or service-role keys. Use `migration-backups/` locally (ignored by git). The official export may contain password hashes, and must be handled as sensitive.

## Safe verification
The owner ran the Windows verification locally: filename and byte count matched the private Storage metadata; the SHA-256 command completed successfully. This proves a local checksum was calculated, **not that the backup contains all essential schemas or can be restored**. No full archive has been sent to the assistant, as requested for privacy. A successful isolated PostgreSQL restore remains mandatory.

## Reversal strategy
Before each release, capture a before/after count manifest and a Cloudflare D1 bookmark. Since the original PostgreSQL remains the source of truth, rollback of early technical reads means switching the feature flag back to PostgreSQL, NOT importing stale D1 records or changing customer balances.

## Explicit prohibition
No production database changes, deletion, Supabase Auth migration, financial cutover, Cloudflare DNS changes, duplicate scheduling, or R2 activation without the prerequisites and explicit approval.
