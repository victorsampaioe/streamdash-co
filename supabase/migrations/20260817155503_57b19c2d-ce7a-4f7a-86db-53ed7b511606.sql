select cron.alter_job(2, command => $SM$
select net.http_post(
  url := 'https://project--53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd.lovable.app/api/public/cron/check',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', (select value #>> '{}' from public.app_settings where key='cron_secret')
  ),
  body := '{}'::jsonb
) as request_id;
$SM$);

select cron.alter_job(9, command => $SM$
select net.http_post(
  url := 'https://project--53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd.lovable.app/api/public/cron/radar',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', (select value #>> '{}' from public.app_settings where key='cron_secret')
  ),
  body := '{}'::jsonb
) as request_id;
$SM$);