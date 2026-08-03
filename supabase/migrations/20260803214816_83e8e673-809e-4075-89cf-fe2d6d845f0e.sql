-- 1) Daily per-region rollup
CREATE TABLE IF NOT EXISTS public.region_checks_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  region_code text NOT NULL,
  day date NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  uptime_pct numeric,
  avg_latency_ms integer,
  max_latency_ms integer,
  downtime_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, region_code, day)
);

GRANT SELECT ON public.region_checks_daily TO authenticated;
GRANT ALL ON public.region_checks_daily TO service_role;

ALTER TABLE public.region_checks_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own region daily"
ON public.region_checks_daily FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- 2) Extra summary columns
ALTER TABLE public.checks_hourly ADD COLUMN IF NOT EXISTS first_detector_region text;
ALTER TABLE public.checks_daily ADD COLUMN IF NOT EXISTS incidents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_region_checks_server_time ON public.region_checks (server_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_checks_server_time ON public.checks (server_id, checked_at DESC);

-- 3) Shorter raw retention
UPDATE public.app_settings
SET value = jsonb_build_object('detail_days', 5, 'hourly_days', 90, 'daily_days', 730),
    updated_at = now()
WHERE key = 'retention';

-- 4) Extend rollups: region daily, first detector, incidents
CREATE OR REPLACE FUNCTION public.rollup_regional(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  since timestamptz := date_trunc('hour', now()) - make_interval(hours => GREATEST(_hours,1));
  a int; b int; c int;
BEGIN
  INSERT INTO public.region_checks_daily
    (server_id, region_code, day, total, ups, downs, uptime_pct, avg_latency_ms, max_latency_ms, downtime_minutes)
  SELECT server_id, region_code, hour::date, sum(total), sum(ups), sum(downs),
         round((sum(ups)::numeric / NULLIF(sum(total),0)) * 100, 2),
         round(avg(avg_latency_ms))::int, max(max_latency_ms),
         round((sum(downs)::numeric / NULLIF(sum(total),0)) * 1440)::int
  FROM public.region_checks_hourly
  WHERE hour >= since - interval '1 day'
  GROUP BY 1,2,3
  ON CONFLICT (server_id, region_code, day) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, downs=EXCLUDED.downs, uptime_pct=EXCLUDED.uptime_pct,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms,
    downtime_minutes=EXCLUDED.downtime_minutes;
  GET DIAGNOSTICS a = ROW_COUNT;

  UPDATE public.checks_hourly ch
  SET first_detector_region = f.region_code
  FROM (
    SELECT DISTINCT ON (rc.server_id, date_trunc('hour', rc.checked_at))
      rc.server_id, date_trunc('hour', rc.checked_at) AS hour, rc.region_code
    FROM public.region_checks rc
    WHERE rc.checked_at >= since AND rc.status = 'down'
    ORDER BY rc.server_id, date_trunc('hour', rc.checked_at), rc.checked_at ASC
  ) f
  WHERE ch.server_id = f.server_id AND ch.hour = f.hour
    AND ch.first_detector_region IS DISTINCT FROM f.region_code;
  GET DIAGNOSTICS b = ROW_COUNT;

  UPDATE public.checks_daily cd
  SET incidents = i.n
  FROM (
    SELECT server_id, started_at::date AS day, count(*)::int AS n
    FROM public.incidents
    WHERE started_at >= since - interval '1 day'
    GROUP BY 1,2
  ) i
  WHERE cd.server_id = i.server_id AND cd.day = i.day AND cd.incidents IS DISTINCT FROM i.n;
  GET DIAGNOSTICS c = ROW_COUNT;

  RETURN jsonb_build_object('region_daily', a, 'first_detector', b, 'incidents', c);
END; $$;

REVOKE ALL ON FUNCTION public.rollup_regional(integer) FROM PUBLIC, anon, authenticated;

-- 5) Consensus verdict with escalation rules
CREATE OR REPLACE FUNCTION public.region_consensus(_server_id uuid, _window_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total int := 0; downs int := 0; ups int := 0; degraded int := 0;
  verdict text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status='down'),
         count(*) FILTER (WHERE status='up'), count(*) FILTER (WHERE status='degraded')
    INTO total, downs, ups, degraded
  FROM (
    SELECT DISTINCT ON (rc.region_code) rc.region_code, rc.status::text AS status
    FROM public.region_checks rc
    WHERE rc.server_id = _server_id
      AND rc.status IN ('up','down','degraded')
      AND rc.checked_at > now() - make_interval(mins => GREATEST(_window_minutes, 1))
    ORDER BY rc.region_code, rc.checked_at DESC
  ) t;

  IF total = 0 THEN verdict := 'nodata';
  ELSIF downs = 0 AND degraded = 0 THEN verdict := 'up';
  ELSIF downs = 0 THEN verdict := 'investigating';
  -- Nunca confirmar offline com apenas 1 região reportando falha.
  ELSIF downs >= 2 AND downs * 2 > total THEN verdict := 'down';
  ELSIF downs >= 2 THEN verdict := 'possible_down';
  ELSE verdict := 'investigating';
  END IF;

  RETURN jsonb_build_object('total', total, 'down', downs, 'up', ups,
    'degraded', degraded, 'verdict', verdict);
END; $$;

-- 6) Full verdict + per-region detail for the dashboard
CREATE OR REPLACE FUNCTION public.get_region_verdict(_server_id uuid, _window_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cons jsonb;
  regs jsonb;
  avg_ms numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = _server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  cons := public.region_consensus(_server_id, _window_minutes);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', r.code, 'name', r.name, 'city', r.city, 'flag', r.flag,
    'status', COALESCE(c.status, 'nodata'), 'latency_ms', c.latency_ms,
    'http_status', c.http_status, 'error', c.error,
    'details', COALESCE(c.details, '{}'::jsonb),
    'source', c.source, 'checked_at', c.checked_at
  ) ORDER BY r.longitude), '[]'::jsonb),
  AVG(c.latency_ms)
  INTO regs, avg_ms
  FROM public.check_regions r
  LEFT JOIN LATERAL (
    SELECT rc.status::text AS status, rc.latency_ms, rc.http_status, rc.error,
           rc.details, rc.source, rc.checked_at
    FROM public.region_checks rc
    WHERE rc.server_id = _server_id AND rc.region_code = r.code
      AND rc.checked_at > now() - make_interval(mins => GREATEST(_window_minutes,1))
    ORDER BY rc.checked_at DESC LIMIT 1
  ) c ON true
  WHERE r.enabled;

  RETURN cons
    || jsonb_build_object('regions', regs, 'avg_latency_ms', round(COALESCE(avg_ms,0)));
END; $$;

REVOKE ALL ON FUNCTION public.get_region_verdict(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_region_verdict(uuid, integer) TO authenticated;

-- 7) Scheduled aggregation + purge
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('sm-rollup-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sm-purge-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('sm-rollup-hourly', '7 * * * *',
  $$ SELECT public.rollup_metrics(3); SELECT public.rollup_regional(3); $$);

SELECT cron.schedule('sm-purge-daily', '25 4 * * *',
  $$ SELECT public.purge_old_metrics(false); $$);