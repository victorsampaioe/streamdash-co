# Stream Monitor — Cloudflare migration backup gate

## Estado (15 November 2026)
Source remains **Lovable Cloud PostgreSQL**, operational and unchanged. Do **not** switch production reads, writes, authentication, payment callbacks, DNS workers, or Telegram jobs to D1 yet.

Cloudflare D1 isolated databases already created:
- `streammonitor-migration-pilot`: inventories and fictitious health sample only.
- `streammonitor-restore-lab`: Time Travel restoration tested with fictitious data.

The pilot includes `migration_readiness` statuses. The local backup **byte count and SHA-256 calculation passed**, while the complete PostgreSQL recovery, independent Storage objects backup, and production cutover remain **blocked**. The export exists in private Lovable Cloud Storage and in the owner's local computer; availability is not proof of restorability.

**Cloudflare staging Worker:** `streammonitor-migration-sandbox` binds only the pilot D1 database and reads exclusively synthetic monitoring data. Its `/health` and `/demo/status` endpoints passed real HTTP checks on the temporary workers.dev address. The public subdomain was disabled immediately after testing. The Worker has no cron trigger or route on `streammonitor.site`. Reproducible source: `cloudflare/migration-sandbox/`.


## Technical D1 contract test — 15 Nov 2026

Another safe staging step was completed directly on Cloudflare. **Nothing below transfers real records or connects production traffic.**

- Matched PostgreSQL fields exactly by name against D1 pilot tables:
  - `checks_hourly`: **12/12**
  - `platform_health_snapshots`: **12/12**
  - `region_checks_hourly`: **9/9**
- Added synthetic-only `pilot_v2_platform_health_snapshots` and `pilot_v2_region_checks_hourly`, alongside the already-tested `pilot_checks_hourly`.
- Confirmed uniqueness/idempotence and rejection of invalid test inputs.
- Re-deployed the *isolated* `streammonitor-migration-sandbox` Worker with 5 read-only HTTP endpoints; all passed against D1. An unknown route returned `not_found`.
- Immediately disabled the public `workers.dev` endpoint again. There are still no production routes or cron schedules on this Worker.
- Saved reproducible schema under `cloudflare/migration-sandbox/migrations/0002_technical_pilot_schema.sql`.
- Updated pilot `migration_readiness` gate `pilot_technical_contracts_v2` to `passed`.

**Do not interpret this as readiness for a full cutover.** Pending: isolated *PostgreSQL* restore of the user's private ~435 MB export; independent Storage backup; tenant-aware authorization and consistency tests; production credentials/Workers; auth and finance migration; written go-live approval. Production source remains the single source of truth.

## First independent live technical module — 15 Nov 2026

A **parallel** Cloudflare Worker `streammonitor-edge-heartbeat` now has
`*/10 * * * *` Cron enabled, recording new public-homepage HTTP observations
into a *separate* D1 database `streammonitor-edge-heartbeat`. One end-to-end
manual test confirmed HTTP 200 and a successful D1 insert (1211 ms); normal
production code disables the test trigger, and the Worker has neither a public
subdomain nor a `streammonitor.site` route. It sends no Telegram alerts,
does not copy production database rows, and does not switch existing monitoring.

**Important:** First actual scheduled execution remains pending observation.
This is a safe first module activation, NOT a cutover of Lovable Cloud:
the PostgreSQL restore and independent Storage backup are unverified, and
financial/auth migrations and final production transfer remain blocked.

To stop the module without changing the original site, set schedules of
`streammonitor-edge-heartbeat` to `[]` in Cloudflare's Workers API. Do not
remove any of the 17 existing PostgreSQL cron jobs.

See `cloudflare/edge-heartbeat/README.md` for source, data retention, checks,
rollback and security scope.

## Admin edge-monitor dashboard — 15 Nov 2026

- **Cron confirmed:** automatic heartbeat at `2026-11-15T19:50:14Z`, site responded HTTP 200 in 1,326 ms; first scheduled sample stored in the dedicated `streammonitor-edge-heartbeat` D1.
- A separate `streammonitor-edge-status-read` Worker was deployed, with only a **sanitized public-homepage availability summary** at `GET /summary`. It has no schedules, route on `streammonitor.site`, credentials, customer information, or write API. The summary **is publicly readable**, since it contains only public site availability metrics.
- Server-side function `src/lib/cloudflare-heartbeat.functions.ts` fetches that summary only after verifying the existing user session and `admin` role. The credentials of Cloudflare are not shipped in site JavaScript.
- Admin panel `src/components/observability/cloudflare-heartbeat-panel.tsx` is included in `/app/admin/observabilidade` and displays the last sample, latency, 24-hour count and a stale-data warning.
- GitHub code has been synchronized with Lovable and a deployment was **requested**. **The pending deployment does not prove it has completed**, and authenticated visual confirmation is still required.
- Source PostgreSQL, existing cron schedules, DNS, billing, customer/auth data and Telegram alerts were not switched.
- The **full migration remains blocked** by isolated PostgreSQL restore, Storage backup, multi-service regression and explicit final authorization.

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
