-- Aggregate platform health without recording customer-level hosts or identities.
CREATE OR REPLACE FUNCTION public.streammonitor_capture_health_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE snap public.platform_health_snapshots%ROWTYPE;
BEGIN
 INSERT INTO public.platform_health_snapshots (
  captured_at,servers_total,servers_online,servers_offline,servers_paused,
  dns_unresolved,avg_latency_ms,incidents_open,telegram_pending,
  telegram_failed_24h,subscriptions_active
 )
 SELECT
  to_timestamp(floor(extract(epoch from now())/900)*900),
  (SELECT count(*) FROM public.servers)::integer,
  (SELECT count(*) FROM public.servers WHERE current_status::text='online')::integer,
  (SELECT count(*) FROM public.servers WHERE current_status::text='offline')::integer,
  (SELECT count(*) FROM public.servers WHERE monitoring_paused=true)::integer,
  (SELECT count(*) FROM public.servers
   WHERE lower(coalesce(dns_status,'')) IN
    ('offline','unresolved','failed','down','not_resolve','no_resolve','not_resolving','nxdomain'))::integer,
  (SELECT round(avg(last_latency_ms)::numeric,1) FROM public.servers
   WHERE current_status::text='online' AND last_latency_ms BETWEEN 0 AND 15000),
  (SELECT count(*) FROM public.incidents WHERE ended_at IS NULL)::integer,
  (SELECT count(*) FROM public.telegram_outbox WHERE status IN ('pending','processing'))::integer,
  (SELECT count(*) FROM public.telegram_outbox WHERE status='dead'
   AND created_at>=now()-interval '24 hours')::integer,
  (SELECT count(*) FROM public.subscriptions
   WHERE status::text='active' AND expires_at>now())::integer
 ON CONFLICT (captured_at) DO UPDATE SET
  servers_total=excluded.servers_total,servers_online=excluded.servers_online,
  servers_offline=excluded.servers_offline,servers_paused=excluded.servers_paused,
  dns_unresolved=excluded.dns_unresolved,avg_latency_ms=excluded.avg_latency_ms,
  incidents_open=excluded.incidents_open,telegram_pending=excluded.telegram_pending,
  telegram_failed_24h=excluded.telegram_failed_24h,
  subscriptions_active=excluded.subscriptions_active
 RETURNING * INTO snap;
 RETURN jsonb_build_object(
  'at',snap.captured_at,'total',snap.servers_total,'online',snap.servers_online,
  'offline',snap.servers_offline,'paused',snap.servers_paused,
  'dnsUnresolved',snap.dns_unresolved,'latency',snap.avg_latency_ms,
  'incidentsOpen',snap.incidents_open,'telegramPending',snap.telegram_pending,
  'telegramFailures24h',snap.telegram_failed_24h,'activeSubscriptions',snap.subscriptions_active
 );
END $func$;
REVOKE ALL ON FUNCTION public.streammonitor_capture_health_snapshot()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_capture_health_snapshot() TO service_role;
