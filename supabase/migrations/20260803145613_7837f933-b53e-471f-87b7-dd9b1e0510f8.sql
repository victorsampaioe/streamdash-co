CREATE OR REPLACE FUNCTION public.delete_server(_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE _owner uuid;
BEGIN
  SELECT owner_id INTO _owner FROM public.servers WHERE id = _id;
  IF _owner IS NULL THEN RETURN false; END IF;
  IF _owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.content_checks WHERE server_id = _id;
  DELETE FROM public.monitored_contents WHERE server_id = _id;
  DELETE FROM public.content_scan_runs WHERE server_id = _id;
  DELETE FROM public.content_daily_summary WHERE server_id = _id;
  DELETE FROM public.content_alert_settings WHERE server_id = _id;
  DELETE FROM public.art_generations WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_items WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_changes WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_daily WHERE server_id = _id;
  DELETE FROM public.iptv_stream_tests WHERE server_id = _id;
  DELETE FROM public.iptv_syncs WHERE server_id = _id;
  DELETE FROM public.iptv_alerts WHERE server_id = _id;
  DELETE FROM public.iptv_ip_history WHERE server_id = _id;
  DELETE FROM public.iptv_login_attempts WHERE server_id = _id;
  DELETE FROM public.dns_snapshots WHERE server_id = _id;
  DELETE FROM public.dns_ip_history WHERE server_id = _id;
  DELETE FROM public.dns_alerts WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats_hourly WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats_daily WHERE server_id = _id;
  DELETE FROM public.kuma_incidents WHERE server_id = _id;
  DELETE FROM public.kuma_monitor_status WHERE server_id = _id;
  DELETE FROM public.region_checks WHERE server_id = _id;
  DELETE FROM public.region_checks_hourly WHERE server_id = _id;
  DELETE FROM public.checks WHERE server_id = _id;
  DELETE FROM public.checks_hourly WHERE server_id = _id;
  DELETE FROM public.checks_daily WHERE server_id = _id;
  DELETE FROM public.notifications_log WHERE server_id = _id;
  DELETE FROM public.incidents WHERE server_id = _id;
  DELETE FROM public.user_achievements WHERE server_id = _id;
  DELETE FROM public.server_analysis WHERE server_id = _id;
  DELETE FROM public.servers WHERE id = _id;
  RETURN true;
END;
$function$;