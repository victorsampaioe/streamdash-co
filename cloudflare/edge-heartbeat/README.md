# Cloudflare edge heartbeat: first live *parallel* module

This is NOT the migration/cutover of the 5.95-GB Lovable Cloud PostgreSQL.
It only checks `https://streammonitor.site/` from Cloudflare Workers once every
10 minutes and writes a tiny **new observation** to a dedicated D1 database.
No existing users, DNS configurations, monitors, financial records or backups
are read/copied. The existing Stream Monitor alerts, monitoring and database
remain authoritative. No customer Telegram notifications are generated.

## Deploy

The Worker source is `worker.mjs`, config is `wrangler.jsonc` and the
dedicated D1 database is `streammonitor-edge-heartbeat`.

Normal deployment has `MANUAL_TEST_ENABLED=false`; the one-time test
temporary endpoint is disabled. `workers.dev` stays **disabled** and there
are **no custom-domain routes**. The only trigger is `*/10 * * * *` (UTC).

## Data

`heartbeat_samples` saves time bucket, status, reachability, response
duration and a small error category. HTTP response bodies, user IPs, cookies,
Auth tokens, DNS configuration, billing data and any other personal data are
never stored. Rows older than 14 days are deleted hourly.

The check is **public homepage HTTP responsiveness only**; a successful
result does not prove login, signups, payment, Telegram, DNS, or full application
health. Edge-to-origin latency is not the user's browser latency.

## Verify

Query the dedicated D1:

```sql
SELECT bucket_start,recorded_at,reachable,http_status,latency_ms,error_kind,sample_type
FROM heartbeat_samples ORDER BY bucket_start DESC LIMIT 5;
SELECT count(*) AS samples,MAX(recorded_at) AS last_sample FROM heartbeat_samples;
```

## Rollback

To disable new checks without destroying data, set the Worker's scheduled
triggers to **an empty array** using Cloudflare Workers API. Do not remove
production cron jobs or any Cloudflare Workers that existed before this
migration. Keep the D1 database for postmortem/verification.

## Safety gates still BLOCKED

- Original PostgreSQL backup must be fully restored and validated in an
  isolated PostgreSQL system.
- Existing Storage objects need an independent backed-up copy.
- Financial data, auth, credit and subscriber migration require reconciled
  checks and explicit final go-live approval.
- No application route/domain/DNS was changed by enabling this observer.
