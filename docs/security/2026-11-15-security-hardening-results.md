# Stream Monitor security review — 15 Nov 2026

## Production permission hotfix: APPLIED AND VERIFIED
Eight **non-trigger, mutating, SECURITY DEFINER** PostgreSQL RPC functions no longer permit execution by the `anon` database role or `PUBLIC`:

- `public.acquire_diagnostic_lock(text)`
- `public.acquire_diagnostic_slot_v2(uuid,uuid,boolean,integer)`
- `public.recalc_iptv_availability()`
- `public.record_diagnostic_failure(uuid)`
- `public.record_diagnostic_success(uuid)`
- `public.release_cron_lock(text)`
- `public.release_diagnostic_lock(text)`
- `public.try_acquire_cron_lock(text,integer,text)`

Post-change live SQL inspection verified **8/8 not executable by `anon`**, and **8/8 remain executable by `authenticated` and `service_role`**. Existing server-side production code uses `supabaseAdmin` for sampled diagnostic and cron-lock call sites, therefore retains the required service role. This was a security permissions change to production functions, **not a change to customer records or function bodies**.

Reproducible action and emergency rollback:
- [Restriction SQL](./2026-11-15-restrict-anon-privileged-rpcs.sql)
- [Rollback SQL](./2026-11-15-restrict-anon-privileged-rpcs-rollback.sql)

**Important: this only removes anonymous execution.** Authenticated callers still have these function privileges. In particular, `acquire_diagnostic_slot_v2` accepts an explicit `p_user_id` and `p_is_admin`, so the next security change should move this group to **service-role-only**, or reimplement caller authorization securely, after inspecting every authenticated call site and running real admin/customer regression tests. Do not claim that this risk is fixed by the current change.

## Immediate production checks
- `profiles`: 128; `servers`: 349; `payments`: 79; `subscriptions`: 87; active `cron.job`: 17 — counts unchanged.
- Public home page and auth page responded to browser-backed GET checks after the change (session-specific login not yet tested).
- All 141 public tables have RLS enabled; private Storage buckets remain private.
- **21 other non-trigger SECURITY DEFINER RPCs remain executable by `anon`**. Most examined ones are public read-only status/help endpoints or contain their own caller checks, but a complete function-by-function audit is still needed.

## Unresolved and not modified
1. **Cloudflare zone bypass:** apex and www are `DNS only`; the zone-specific WAF/custom rate limits cannot protect main-site requests until appropriately proxied. **Do not enable the orange-cloud proxy before verifying compatibility with Lovable hosting, TLS and auth.**
2. **Worker secret configuration:** `REGION_WORKER_SECRET` is `plain_text` on `stream-monitor-api`; it is `secret_text` on `streammonitor-regional-edge`. A direct connector-based test to convert plain text to a Secret was blocked; **no value was returned or rotated, and no production binding was changed**. Requires secure, coordinated migration and likely credential rotation.
3. **SSL origin verification:** zone mode is Full, not Full (strict). Check the origin certificate/host compatibility before changing.
4. **CSP:** deployed site includes `script-src 'unsafe-inline' 'unsafe-eval'`. Audit dependency/runtime requirements and test CSP report-only before tightening.
5. **PostgreSQL restore:** official backup has user-local SHA256 and byte-count validation but no independently tested isolated PostgreSQL restore; do not migrate actual customer, finance or auth records.
6. **Storage objects:** independent private backup still needs verification; database dump alone is insufficient.

## Test cleanup
A disposable, **unrouted and non-public** Worker `streammonitor-secret-migration-lab` was created for a secret-binding migration test. The conversion attempt was blocked by the connector. This disposable test Worker was deleted after confirming it had no routes, subdomain or cron schedule. The unrelated `streammonitor-migration-sandbox` D1 Worker remains isolated and without a public subdomain.

Cloudflare D1 pilot `pilot_security_findings` updated to mark the anonymous-RPC change verified, while the wider RPC review, DNS and secret issues remain unresolved.

## Production safety and rollback
Do not modify customer/financial data, switch the Cloudflare DNS, migrate PostgreSQL records to D1, remove the source database, or duplicate Telegram schedules without backup restore validation and separately approved cutover.

If a legitimate feature is proven to depend on anonymous execution of any protected RPC, first identify its actual caller and security role; use the recorded grant rollback SQL only as an emergency mitigation with user approval and investigate how to move that call to an authenticated service endpoint.
