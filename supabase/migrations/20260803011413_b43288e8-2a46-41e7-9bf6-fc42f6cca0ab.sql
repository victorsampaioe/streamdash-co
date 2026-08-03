CREATE OR REPLACE FUNCTION public.content_health_overview(_server_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'online', COUNT(*) FILTER (WHERE current_status='online'),
    'slow', COUNT(*) FILTER (WHERE current_status='slow'),
    'suspect', COUNT(*) FILTER (WHERE current_status='suspect'),
    'unstable', COUNT(*) FILTER (WHERE current_status='unstable'),
    'offline', COUNT(*) FILTER (WHERE current_status='offline'),
    'blocked', COUNT(*) FILTER (WHERE current_status='blocked'),
    'removed', COUNT(*) FILTER (WHERE current_status='removed'),
    'unknown', COUNT(*) FILTER (WHERE current_status='unknown'),
    'avg_ms', ROUND(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL)),
    'last_checked_at', MAX(last_checked_at)
  ) INTO res
  FROM public.monitored_contents mc
  WHERE (mc.reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    AND (_server_id IS NULL OR mc.server_id = _server_id);
  RETURN COALESCE(res, '{}'::jsonb);
END; $$;