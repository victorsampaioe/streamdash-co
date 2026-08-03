SELECT public.rollup_metrics(48);

CREATE OR REPLACE FUNCTION public.get_region_series(_server_id uuid, _minutes integer DEFAULT 180, _limit integer DEFAULT 600)
RETURNS TABLE(region_code text, status text, latency_ms integer, http_status integer, error text, checked_at timestamptz, details jsonb, source text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rc.region_code, rc.status::text, rc.latency_ms, rc.http_status, rc.error, rc.checked_at,
         COALESCE(rc.details,'{}'::jsonb), COALESCE(rc.source,'worker')
  FROM public.region_checks rc
  JOIN public.servers s ON s.id = rc.server_id
  WHERE rc.server_id = _server_id
    AND rc.checked_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
    AND (s.owner_id = auth.uid() OR s.is_public = true OR public.has_role(auth.uid(),'admin'))
  ORDER BY rc.checked_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
$$;

REVOKE ALL ON FUNCTION public.get_region_series(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_region_series(uuid, integer, integer) TO authenticated;