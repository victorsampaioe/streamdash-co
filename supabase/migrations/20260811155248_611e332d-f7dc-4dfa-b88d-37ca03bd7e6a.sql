DROP POLICY IF EXISTS "checks: public read" ON public.checks;
DROP POLICY IF EXISTS "checks: public read auth" ON public.checks;
DROP POLICY IF EXISTS "Public reads region checks of public servers" ON public.region_checks;

CREATE OR REPLACE FUNCTION public.get_public_region_checks(_slug text, _minutes integer DEFAULT 60, _limit integer DEFAULT 300)
RETURNS TABLE(region_code text, status text, latency_ms integer, checked_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rc.region_code, rc.status::text, rc.latency_ms, rc.checked_at
  FROM public.region_checks rc
  JOIN public.servers s ON s.id = rc.server_id
  WHERE s.public_slug = _slug AND s.is_public = true
    AND rc.checked_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
  ORDER BY rc.checked_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.get_public_region_checks(text, integer, integer) TO anon, authenticated;