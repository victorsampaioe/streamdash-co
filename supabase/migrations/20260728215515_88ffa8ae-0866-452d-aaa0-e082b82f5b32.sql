
-- Enable realtime
ALTER TABLE public.region_checks REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'region_checks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.region_checks;
  END IF;
END $$;

-- Index for fast per-server per-region lookups
CREATE INDEX IF NOT EXISTS region_checks_server_region_time_idx
  ON public.region_checks (server_id, region_code, checked_at DESC);

CREATE INDEX IF NOT EXISTS region_checks_region_time_idx
  ON public.region_checks (region_code, checked_at DESC);

-- RPC: worker heartbeat (last reported per region across whole system)
CREATE OR REPLACE FUNCTION public.get_workers_health()
RETURNS TABLE(region_code text, last_report_at timestamptz, checks_60s bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.code AS region_code,
         MAX(rc.checked_at) AS last_report_at,
         COUNT(rc.*) FILTER (WHERE rc.checked_at > now() - interval '60 seconds') AS checks_60s
  FROM public.check_regions r
  LEFT JOIN public.region_checks rc ON rc.region_code = r.code
    AND rc.checked_at > now() - interval '10 minutes'
  WHERE r.enabled = true AND r.code <> 'origin'
  GROUP BY r.code
  ORDER BY r.code;
$$;

GRANT EXECUTE ON FUNCTION public.get_workers_health() TO anon, authenticated;

-- RPC: per-region latency stats for a given server (last N minutes)
CREATE OR REPLACE FUNCTION public.get_region_stats(_server_id uuid, _minutes int DEFAULT 60)
RETURNS TABLE(
  region_code text,
  total bigint,
  ups bigint,
  downs bigint,
  min_ms int,
  max_ms int,
  avg_ms numeric,
  p95_ms numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rc.region_code,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE rc.status = 'up') AS ups,
    COUNT(*) FILTER (WHERE rc.status = 'down') AS downs,
    MIN(rc.latency_ms) AS min_ms,
    MAX(rc.latency_ms) AS max_ms,
    ROUND(AVG(rc.latency_ms)::numeric, 0) AS avg_ms,
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY rc.latency_ms)::numeric, 0) AS p95_ms
  FROM public.region_checks rc
  JOIN public.servers s ON s.id = rc.server_id
  WHERE rc.server_id = _server_id
    AND rc.checked_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
    AND (s.owner_id = auth.uid() OR s.is_public = true OR public.has_role(auth.uid(),'admin'))
  GROUP BY rc.region_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_region_stats(uuid, int) TO anon, authenticated;
