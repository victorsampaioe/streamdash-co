
CREATE OR REPLACE FUNCTION public.get_stability_ranking(_limit int DEFAULT 20)
RETURNS TABLE (
  name text,
  avg_latency_ms numeric,
  max_latency_ms int,
  down_count bigint,
  total_checks bigint,
  instability_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.name,
    ROUND(AVG(c.latency_ms)::numeric, 0) AS avg_latency_ms,
    COALESCE(MAX(c.latency_ms), 0)::int AS max_latency_ms,
    COUNT(*) FILTER (WHERE c.status <> 'up') AS down_count,
    COUNT(*) AS total_checks,
    ROUND(
      (COUNT(*) FILTER (WHERE c.status <> 'up')::numeric / NULLIF(COUNT(*),0)) * 100
      + (COALESCE(AVG(c.latency_ms), 0) / 100),
      2
    ) AS instability_score
  FROM public.checks c
  JOIN public.servers s ON s.id = c.server_id
  WHERE c.checked_at > now() - interval '24 hours'
  GROUP BY s.id, s.name
  HAVING COUNT(*) >= 3
  ORDER BY instability_score DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

REVOKE ALL ON FUNCTION public.get_stability_ranking(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stability_ranking(int) TO authenticated;
