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
    'total_monitored', (
        SELECT COUNT(*) 
        FROM public.servers s
        JOIN public.profiles p ON p.id = s.owner_id
        WHERE s.iptv_mode != 'basic' 
          AND s.monitoring_paused IS FALSE
          AND p.is_reseller IS TRUE -- Ativos (Revendedores)
    ),
    'configured_iptv', (
      SELECT COUNT(DISTINCT s.id)
      FROM public.servers s
      JOIN public.profiles p ON p.id = s.owner_id
      LEFT JOIN public.iptv_login_attempts l ON l.server_id = s.id
      WHERE s.iptv_mode != 'basic'
        AND s.monitoring_paused IS FALSE
        AND p.is_reseller IS TRUE
        AND s.iptv_username IS NOT NULL
        AND s.iptv_password IS NOT NULL
        AND s.iptv_detected IN ('xtream', 'both')
        AND (l.failures IS NULL OR l.failures = 0)
    ),
    'waiting_credentials', (
      SELECT COUNT(s.id)
      FROM public.servers s
      JOIN public.profiles p ON p.id = s.owner_id
      LEFT JOIN public.iptv_login_attempts l ON l.server_id = s.id
      WHERE s.iptv_mode != 'basic'
        AND s.monitoring_paused IS FALSE
        AND p.is_reseller IS TRUE
        AND (
          s.iptv_username IS NULL 
          OR s.iptv_password IS NULL 
          OR s.iptv_detected NOT IN ('xtream', 'both')
          OR (l.failures > 0)
        )
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
  JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN public.iptv_login_attempts l ON l.server_id = s.id
  WHERE s.iptv_mode != 'basic'
    AND s.monitoring_paused IS FALSE
    AND p.is_reseller IS TRUE
    AND s.iptv_username IS NOT NULL
    AND s.iptv_password IS NOT NULL
    AND s.iptv_detected IN ('xtream', 'both')
    AND (l.failures IS NULL OR l.failures = 0);

  RETURN jsonb_build_object(
    'servers_found', COALESCE(array_length(server_ids, 1), 0),
    'server_ids', COALESCE(server_ids, '{}'::uuid[])
  );
END;
$function$;
