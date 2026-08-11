CREATE OR REPLACE FUNCTION public.get_iptv_radar_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_monitored', (SELECT COUNT(*) FROM public.servers WHERE iptv_mode != 'basic' AND monitoring_paused IS FALSE),
    'configured_iptv', (
      SELECT COUNT(DISTINCT s.id) 
      FROM public.servers s
      JOIN public.iptv_credentials c ON c.server_id = s.id
      WHERE s.iptv_mode != 'basic' 
        AND s.monitoring_paused IS FALSE 
        AND c.username IS NOT NULL 
        AND c.password IS NOT NULL
        AND s.iptv_detected IN ('xtream', 'both')
    ),
    'waiting_credentials', (
      SELECT COUNT(s.id) 
      FROM public.servers s
      LEFT JOIN public.iptv_credentials c ON c.server_id = s.id
      WHERE s.iptv_mode != 'basic' 
        AND s.monitoring_paused IS FALSE 
        AND (c.username IS NULL OR c.password IS NULL OR s.iptv_detected NOT IN ('xtream', 'both'))
    ),
    'total_contents', (SELECT COUNT(*) FROM public.iptv_global_catalog),
    'first_detections', (SELECT COUNT(*) FROM public.iptv_global_catalog WHERE first_detected_at IS NOT NULL)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_radar_batch_sync()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  server_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT array_agg(s.id) INTO server_ids
  FROM public.servers s
  JOIN public.iptv_credentials c ON c.server_id = s.id
  WHERE s.iptv_mode != 'basic' 
    AND s.monitoring_paused IS FALSE 
    AND c.username IS NOT NULL 
    AND c.password IS NOT NULL
    AND s.iptv_detected IN ('xtream', 'both');

  RETURN jsonb_build_object(
    'servers_found', COALESCE(array_length(server_ids, 1), 0),
    'server_ids', COALESCE(server_ids, '{}'::uuid[])
  );
END;
$function$;
