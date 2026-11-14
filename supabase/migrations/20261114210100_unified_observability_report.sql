
CREATE OR REPLACE FUNCTION public.streammonitor_observability_report(p_days integer DEFAULT 14)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $body$
WITH settings AS (
 SELECT LEAST(GREATEST(coalesce(p_days,14),7),30) AS days,
 (now() AT TIME ZONE 'America/Fortaleza')::date AS today
),
 calendar AS (
 SELECT (s.today - step.n)::date AS day
 FROM settings s CROSS JOIN LATERAL generate_series(0,s.days-1) AS step(n)
),
 visits AS (
 SELECT (e.created_at AT TIME ZONE 'America/Fortaleza')::date AS day,
 count(*) FILTER (WHERE e.event_name='$pageview')::integer AS pageviews,
 count(DISTINCT e.session_id) FILTER (WHERE e.event_name='$pageview')::integer AS visitors,
 count(*) FILTER (WHERE e.event_name='sm_signup_started')::integer AS signup_started,
 count(*) FILTER (WHERE e.event_name='sm_signup_completed')::integer AS signup_events,
 count(*) FILTER (WHERE e.event_name='sm_feature_opened')::integer AS feature_opens
 FROM public.platform_analytics_events e CROSS JOIN settings s
 WHERE e.created_at >= ((s.today-(s.days-1))::timestamp AT TIME ZONE 'America/Fortaleza')
 GROUP BY 1
),
 registrations AS (
 SELECT (p.created_at AT TIME ZONE 'America/Fortaleza')::date AS day, count(*)::integer AS accounts
 FROM public.profiles p CROSS JOIN settings s
 WHERE p.created_at >= ((s.today-(s.days-1))::timestamp AT TIME ZONE 'America/Fortaleza')
 GROUP BY 1
),
 paid AS (
 SELECT (coalesce(p.paid_at,p.updated_at) AT TIME ZONE 'America/Fortaleza')::date AS day,
 count(*)::integer AS orders,coalesce(sum(p.amount_cents),0)::bigint AS cents
 FROM public.payments p CROSS JOIN settings s
 WHERE p.status::text='approved' AND coalesce(p.paid_at,p.updated_at)>=
 ((s.today-(s.days-1))::timestamp AT TIME ZONE 'America/Fortaleza')
 GROUP BY 1
),
 daily AS (
 SELECT c.day,
 coalesce(v.pageviews,0) AS pageviews,coalesce(v.visitors,0) AS visitors,
 coalesce(v.signup_started,0) AS signup_started,coalesce(v.signup_events,0) AS signup_events,
 coalesce(v.feature_opens,0) AS feature_opens,coalesce(r.accounts,0) AS registrations,
 coalesce(p.orders,0) AS paid_orders,coalesce(p.cents,0) AS revenue_cents
 FROM calendar c LEFT JOIN visits v ON v.day=c.day
 LEFT JOIN registrations r ON r.day=c.day LEFT JOIN paid p ON p.day=c.day
),
 features AS (
 SELECT e.screen,count(*)::integer AS opens
 FROM public.platform_analytics_events e CROSS JOIN settings s
 WHERE e.event_name='sm_feature_opened' AND e.created_at >=
 ((s.today-(s.days-1))::timestamp AT TIME ZONE 'America/Fortaleza')
 GROUP BY e.screen ORDER BY opens DESC LIMIT 8
),
 history AS (
 SELECT captured_at,servers_online,servers_offline,avg_latency_ms,telegram_pending,incidents_open
 FROM public.platform_health_snapshots h CROSS JOIN settings s
 WHERE h.captured_at >= now() - (s.days||' days')::interval
 ORDER BY h.captured_at DESC LIMIT 720
)
SELECT jsonb_build_object(
 'days',(SELECT days FROM settings),
 'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'day',day,'pageviews',pageviews,'visitors',visitors,'signupStarted',signup_started,
  'signupEvents',signup_events,'featureOpens',feature_opens,'registrations',registrations,
  'paidOrders',paid_orders,'revenueCents',revenue_cents
 ) ORDER BY day),'[]'::jsonb) FROM daily),
 'features',(SELECT coalesce(jsonb_agg(jsonb_build_object('screen',screen,'opens',opens)),'[]'::jsonb) FROM features),
 'health',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'time',captured_at,'online',servers_online,'offline',servers_offline,
  'latency',avg_latency_ms,'telegramPending',telegram_pending,'incidentsOpen',incidents_open
 ) ORDER BY captured_at),'[]'::jsonb) FROM history),
 'trackingStarted',(SELECT min(created_at) FROM public.platform_analytics_events)
);
$body$;
REVOKE ALL ON FUNCTION public.streammonitor_observability_report(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_observability_report(integer) TO service_role;
