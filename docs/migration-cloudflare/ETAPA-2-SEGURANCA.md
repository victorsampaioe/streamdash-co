# Stream Monitor — Cloudflare migration backup gate

## Estado (15 November 2026)
Source remains **Lovable Cloud PostgreSQL**, operational and unchanged. Do **not** switch production reads, writes, authentication, payment callbacks, DNS workers, or Telegram jobs to D1 yet.

Cloudflare D1 isolated databases already created:
- `streammonitor-migration-pilot`: inventories and fictitious health sample only.
- `streammonitor-restore-lab`: Time Travel restoration tested with fictitious data.

The pilot includes `migration_readiness` statuses; `postgres_full_export`, `postgres_restore_test`, `storage_objects_export`, and `live_cutover` are **blocked**.

## Critical migration gates (ALL must pass)
1. Obtain independent **complete PostgreSQL export**, including `auth`, schema, roles/policies, triggers and production rows, using Lovable Cloud's **official project data export**.
2. Export **Storage objects separately**, including bucket configuration and policies; don't assume database export includes files.
3. Save backup **encrypted and offline or in access-restricted object storage outside the production project**, and calculate SHA-256.
4. Restore into an **isolated PostgreSQL environment** (never the live database); validate schema, auth account count, login mechanism, RLS, financial balances, credits, FK integrity, payment & subscription records, and recoverability.
5. Re-create non-database dependencies intentionally: secrets without printing or committing values, queue and cron delivery, auth provider config, webhooks, file ACL, R2 and audit logs.
6. Run dual-read reconciliation for technical tables, then request explicit user sign-off before any financial data movement or production cutover.

## What is known
- Source PostgreSQL 17.6, approx. 5.95 GB including indexes.
- 141 public tables, 148 public functions, 54 public triggers, 212 RLS policies, 17 active cron jobs, three private Storage buckets.
- Cloudflare D1 uses SQLite semantics; **Postgres role policies, extensions, triggers, functions and Auth do not migrate by directly copying tables**.
- Source has Supabase Auth, pg_cron, pg_net, pgcrypto, Supabase Vault and Storage; keep source running throughout staged migration.
- At last inventory the Storage had 25 files in `promo-arts` (~43.6 MB); other two buckets had zero. Re-check before export.
- The Lovable connector currently supports SQL queries, not the official export action. **Do not use a production data SELECT loop as a substitute for an auditable, restorable backup**.

## Secret handling (public repository!)
NEVER commit customer data, password hashes, exports, private Storage images, tokens, wallets, payment records, dumps, connection strings, or service-role keys. Use `migration-backups/` locally (ignored by git). The official export may contain password hashes, and must be handled as sensitive.

## Safe verification
When you obtain the official archive, use the offline verifier provided with the migration report to compute SHA-256 and identify the archive format. This is only an initial sanity check; a successful isolated restore remains mandatory.

## Reversal strategy
Before each release, capture a before/after count manifest and a Cloudflare D1 bookmark. Since the original PostgreSQL remains the source of truth, rollback of early technical reads means switching the feature flag back to PostgreSQL, NOT importing stale D1 records or changing customer balances.

## Explicit prohibition
No production database changes, deletion, Supabase Auth migration, financial cutover, Cloudflare DNS changes, duplicate scheduling, or R2 activation without the prerequisites and explicit approval.
