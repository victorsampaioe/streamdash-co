-- lovable-cron-fallback-reviewed: 1440 runs/day; required to deliver queued webhook retries within the documented one-minute window
SELECT cron.schedule(
  'streammonitor-api-webhook-delivery',
  '* * * * *',
  $SM$
  SELECT net.http_post(
    url := 'https://project--53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd.lovable.app/api/public/cron/api-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $SM$
);