CREATE OR REPLACE FUNCTION public.get_iptv_radar_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  -- Requisito: Apenas administradores ou usuários ativos com acesso
  -- (Para estatísticas globais, geralmente apenas admin)
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
    ),
    'waiting_credentials', (
      SELECT COUNT(s.id) 
      FROM public.servers s
      LEFT JOIN public.iptv_credentials c ON c.server_id = s.id
      WHERE s.iptv_mode != 'basic' 
        AND s.monitoring_paused IS FALSE 
        AND (c.username IS NULL OR c.password IS NULL)
    ),
    'total_contents', (SELECT COUNT(*) FROM public.iptv_global_catalog),
    'first_detections', (SELECT COUNT(*) FROM public.iptv_global_catalog WHERE first_detected_at IS NOT NULL)
  ) INTO result;

  RETURN result;
END;
$function$;
