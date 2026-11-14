CREATE OR REPLACE FUNCTION public.streammonitor_prune_observability()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE removed_events integer;removed_snapshots integer;
BEGIN
 DELETE FROM public.platform_analytics_events
 WHERE created_at<now()-interval '90 days';
 GET DIAGNOSTICS removed_events=ROW_COUNT;
 DELETE FROM public.platform_health_snapshots
 WHERE captured_at<now()-interval '90 days';
 GET DIAGNOSTICS removed_snapshots=ROW_COUNT;
 RETURN removed_events+removed_snapshots;
END $fn$;
REVOKE ALL ON FUNCTION public.streammonitor_prune_observability() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_prune_observability() TO service_role;
SELECT cron.schedule('streammonitor-observability-retention','15 7 * * *',
 'SELECT public.streammonitor_prune_observability()');