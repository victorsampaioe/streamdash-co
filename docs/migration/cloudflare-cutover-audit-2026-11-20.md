# Stream Monitor - Cloudflare migration audit (2026-11-20)

STATUS: SHADOW MIGRATION UPDATED. PRODUCTION CUTOVER BLOCKED.

## Verified source baseline
- Source PostgreSQL: 6,599,199,891 bytes, 164 public tables, 153 public routines, 232 public RLS policies, 20 live cron jobs.
- Accounts: 193 Auth users, 193 profiles, 252 roles; 418 servers (148 with IPTV credential fields), 117 subscriptions, 101 payments, 52 alert channels, 784 Telegram outbox messages.
- Source Storage: 38 files (two PostgreSQL archives, 30 promotional arts, six video templates).
- Cloudflare: eight D1 databases, nineteen Workers, two R2 buckets, one Queue.

## Isolated D1 shadow refresh completed
- Profiles: 193/193.
- Role associations: 252/252.
- Server metadata: 418/418 current records; four old records retained as tombstones, no deletion.
- Subscription metadata: 117/117.
- Payment metadata: 101/101.
- Auth metadata: only 187/193; no encrypted hashes or sessions imported.
- Alert channels: 51/52; Telegram outbox: 649/784.
- Refresh snapshot ID: live-metadata-2026-11-20-2114-BRT.
- No production accounts, balances, webhooks, auth endpoints or alert delivery were switched.
- The production cutover flag and old-message dispatch flag remain OFF.

## Storage backup
R2 backup ledger now contains **38 / 38 copied objects, 1,100,867,587 bytes**. The two missing promotional PNGs (1,979,290 bytes each) were copied and verified by SHA-256 by the existing private backup Worker on 20 Nov. After verifying that all 38 ledger entries were complete and the Worker lease was released, the transfer flag was explicitly set back to disabled. R2 contains PostgreSQL archives dated 15 Nov and 19 Nov. **A full isolated PostgreSQL restore remains UNVERIFIED**, so a copy is not proof of database recoverability.

## REQUIRED before retiring Lovable Cloud database
1. Independent, complete PostgreSQL restore and rollback rehearsal, not merely archive-size verification.
2. Secure encrypted export/import of 193 login identities, password verification and sessions; implement Auth replacement, RBAC and RLS parity. Do not bypass connector restrictions or log password hashes.
3. Encrypted transfer and verification for 148 source server credentials, never plaintext staging.
4. Convert PostgreSQL schema, triggers, functions and queries to Cloudflare Workers plus SQLite D1 / R2; separate large history archives from hot customer data.
5. Implement continuous change/delete sync, compare current source IDs and financial totals and clean up tombstones only after multiple consistent checks.
6. Validate subscriptions, reseller wallets, credits, Pix webhooks, idempotency and refunds without double processing.
7. Move the real Telegram message queue and sender to Cloudflare with retry guarantees, not only a Queue stub.
8. Replace each of the 20 live PostgreSQL cron jobs and monitor correctness.
9. Replace frontend and server Supabase reads and Auth with Cloudflare APIs, keeping Lovable only as a display layer if desired.
10. Canary with verified parity, tested rollback, then explicit production cutover.

Never disable the original Supabase Auth, PostgreSQL, Storage, pg_cron or financial webhooks while these gates are unmet. D1 is SQLite, not PostgreSQL; large DBs require schema conversion and capacity/retention planning.


## Additional verified work (20 Nov, 22:22 BRT)

- Created Cloudflare Pages project `streammonitor-cloudflare-preview`, linked to GitHub `main` with `npm run build` and build output `.output/public`. Its first automatic GitHub-triggered deploy succeeded.
- Cloudflare Browser Rendering loaded `/`, `/login`, `/app` and `/app/ativacao-aplicativos` from the new `pages.dev` preview without an internal-server error. **This proves frontend hosting only**, not a database migration. The production `streammonitor.site` DNS remains unchanged.
- Protected `streammonitor-signup-email` against the empty-token/empty-secret authentication bypass. It now fails closed if the incoming token or its configured secret is missing/too short; the email binding was preserved. Reconfigure or verify the secret before using that webhook in production.
- Refreshed D1 staging from live Lovable PostgreSQL to 194 profiles, 194 Auth *identity metadata* records, 253 role memberships, 419 server metadata records, 118 subscriptions, 101 payments, 52 alert-channel metadata records and 829 Telegram outbox metadata records.
- Server data: 149 credentialed active servers, but **zero credential values** transferred. No Auth hashes or sessions, Telegram recipients, Telegram message bodies or payment secrets transferred.
- The Cloudflare regional DNS Worker runs each minute and writes fresh D1 samples, but **still calls Lovable** as `ENDPOINT_BASE` to obtain target lists and report results. Do not switch it to D1 as system of record before continuous data propagation and notification parity are tested.
- Source PostgreSQL still runs 20 cron jobs. The D1 staging is explicitly `PILOT_ONLY` and the production cutover control remains `enabled=0`.
- Required work remains: validated full PostgreSQL restore, dedicated secure Auth transition, protected IPTV credential transfer, recurring billing/wallet/credits cutover, Telegram Queue consumer and webhook parity, replacing the 20 Postgres jobs, continuous CDC or a reliable source-to-D1 event stream, and confirmed functional parity before DNS cutover.
