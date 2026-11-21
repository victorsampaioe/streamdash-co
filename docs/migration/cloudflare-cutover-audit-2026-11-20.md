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
