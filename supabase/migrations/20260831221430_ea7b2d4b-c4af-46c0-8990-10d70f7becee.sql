CREATE TABLE IF NOT EXISTS public.server_perf_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  api_ms integer,
  open_ms integer,
  open_min_ms integer,
  open_max_ms integer,
  total_ms integer,
  samples integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'error',
  error text,
  source text NOT NULL DEFAULT 'core',
  CONSTRAINT server_perf_runs_state_chk CHECK (state IN ('ok','timeout','stream_unavailable','offline','error'))
);

CREATE INDEX IF NOT EXISTS server_perf_runs_server_time_idx ON public.server_perf_runs (server_id, measured_at DESC);

GRANT SELECT ON public.server_perf_runs TO authenticated;
GRANT ALL ON public.server_perf_runs TO service_role;

ALTER TABLE public.server_perf_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf runs readable by owner or admin" ON public.server_perf_runs;
CREATE POLICY "perf runs readable by owner or admin"
ON public.server_perf_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_perf_runs.server_id AND s.owner_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_performance_ranking(_limit integer DEFAULT 100)
RETURNS TABLE (
  server_id uuid,
  name text,
  host text,
  status text,
  health_score integer,
  api_ms integer,
  open_ms integer,
  open_ms_24h integer,
  open_avg_ms integer,
  open_best_ms integer,
  open_worst_ms integer,
  stability_pct numeric,
  measurements integer,
  last_measured_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT s.id, s.name, s.host, s.current_status::text AS status, s.health_score
    FROM public.servers s
    WHERE s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  ),
  runs7 AS (
    SELECT r.server_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY r.open_ms)::int AS open_ms,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY r.api_ms)::int AS api_ms,
           avg(r.open_ms)::int AS open_avg_ms,
           min(r.open_ms)::int AS open_best_ms,
           max(r.open_ms)::int AS open_worst_ms,
           count(*)::int AS measurements,
           max(r.measured_at) AS last_measured_at
    FROM public.server_perf_runs r
    WHERE r.measured_at > now() - interval '7 days' AND r.ok
    GROUP BY r.server_id
  ),
  runs24 AS (
    SELECT r.server_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY r.open_ms)::int AS open_ms
    FROM public.server_perf_runs r
    WHERE r.measured_at > now() - interval '24 hours' AND r.ok
    GROUP BY r.server_id
  ),
  stab AS (
    SELECT c.server_id,
           (100.0 * count(*) FILTER (WHERE c.status = 'up') / NULLIF(count(*), 0))::numeric(5,2) AS pct
    FROM public.checks c
    WHERE c.checked_at > now() - interval '7 days'
    GROUP BY c.server_id
  ),
  latest AS (
    SELECT DISTINCT ON (r.server_id) r.server_id, r.measured_at
    FROM public.server_perf_runs r
    ORDER BY r.server_id, r.measured_at DESC
  )
  SELECT v.id, v.name, v.host, v.status, v.health_score,
         r7.api_ms, r7.open_ms, r24.open_ms, r7.open_avg_ms, r7.open_best_ms, r7.open_worst_ms,
         st.pct, COALESCE(r7.measurements, 0), l.measured_at
  FROM visible v
  LEFT JOIN runs7 r7 ON r7.server_id = v.id
  LEFT JOIN runs24 r24 ON r24.server_id = v.id
  LEFT JOIN stab st ON st.server_id = v.id
  LEFT JOIN latest l ON l.server_id = v.id
  ORDER BY r7.open_ms NULLS LAST
  LIMIT COALESCE(_limit, 100);
$$;

REVOKE ALL ON FUNCTION public.get_performance_ranking(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_ranking(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_server_perf_history(_server_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE (
  measured_at timestamptz,
  api_ms integer,
  open_ms integer,
  ok boolean,
  state text,
  error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.measured_at, r.api_ms, r.open_ms, r.ok, r.state, r.error
  FROM public.server_perf_runs r
  WHERE r.server_id = _server_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = _server_id AND s.owner_id = auth.uid())
    )
  ORDER BY r.measured_at DESC
  LIMIT COALESCE(_limit, 50);
$$;

REVOKE ALL ON FUNCTION public.get_server_perf_history(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_perf_history(uuid, integer) TO authenticated;