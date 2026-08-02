-- 1) DUPLICATE / REDUNDANT INDEX CLEANUP -------------------------------------
DROP INDEX IF EXISTS public.idx_region_checks_server_region_time;
DROP INDEX IF EXISTS public.region_checks_server_region_time_idx;
DROP INDEX IF EXISTS public.idx_iptv_catalog_items_server_kind;
DROP INDEX IF EXISTS public.idx_iptv_catalog_items_title_key;

-- 2) SETTINGS -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage settings" ON public.app_settings;
CREATE POLICY "admins manage settings" ON public.app_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_settings(key, value) VALUES
  ('retention', '{"detail_days":30,"hourly_days":90,"daily_days":730}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) ROLLUP TABLES ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checks_hourly (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  hour timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  degraded integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  min_latency_ms integer,
  ssl_days_remaining integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, hour)
);
GRANT SELECT ON public.checks_hourly TO authenticated;
GRANT ALL ON public.checks_hourly TO service_role;
ALTER TABLE public.checks_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads checks_hourly" ON public.checks_hourly;
CREATE POLICY "owner reads checks_hourly" ON public.checks_hourly FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.checks_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  day date NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  degraded integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  uptime_pct numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, day)
);
GRANT SELECT ON public.checks_daily TO authenticated;
GRANT ALL ON public.checks_daily TO service_role;
ALTER TABLE public.checks_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads checks_daily" ON public.checks_daily;
CREATE POLICY "owner reads checks_daily" ON public.checks_daily FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.region_checks_hourly (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  region_code text NOT NULL,
  hour timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, region_code, hour)
);
GRANT SELECT ON public.region_checks_hourly TO authenticated;
GRANT ALL ON public.region_checks_hourly TO service_role;
ALTER TABLE public.region_checks_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads region_checks_hourly" ON public.region_checks_hourly;
CREATE POLICY "owner reads region_checks_hourly" ON public.region_checks_hourly FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.kuma_heartbeats_hourly (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  hour timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, kind, hour)
);
GRANT SELECT ON public.kuma_heartbeats_hourly TO authenticated;
GRANT ALL ON public.kuma_heartbeats_hourly TO service_role;
ALTER TABLE public.kuma_heartbeats_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads kuma_hourly" ON public.kuma_heartbeats_hourly;
CREATE POLICY "owner reads kuma_hourly" ON public.kuma_heartbeats_hourly FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.kuma_heartbeats_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day date NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  uptime_pct numeric(5,2),
  avg_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, kind, day)
);
GRANT SELECT ON public.kuma_heartbeats_daily TO authenticated;
GRANT ALL ON public.kuma_heartbeats_daily TO service_role;
ALTER TABLE public.kuma_heartbeats_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads kuma_daily" ON public.kuma_heartbeats_daily;
CREATE POLICY "owner reads kuma_daily" ON public.kuma_heartbeats_daily FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- 4) ROLLUP FUNCTION ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollup_metrics(_hours integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  since timestamptz := date_trunc('hour', now()) - make_interval(hours => GREATEST(_hours,1));
  a int; b int; c int; d int; e int;
BEGIN
  INSERT INTO public.checks_hourly (server_id, hour, total, ups, degraded, downs, avg_latency_ms, max_latency_ms, min_latency_ms, ssl_days_remaining)
  SELECT server_id, date_trunc('hour', checked_at), count(*),
         count(*) FILTER (WHERE status='up'), count(*) FILTER (WHERE status='degraded'), count(*) FILTER (WHERE status='down'),
         round(avg(latency_ms))::int, max(latency_ms), min(latency_ms), max(ssl_days_remaining)
  FROM public.checks WHERE checked_at >= since
  GROUP BY 1,2
  ON CONFLICT (server_id, hour) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, degraded=EXCLUDED.degraded, downs=EXCLUDED.downs,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms,
    min_latency_ms=EXCLUDED.min_latency_ms, ssl_days_remaining=EXCLUDED.ssl_days_remaining;
  GET DIAGNOSTICS a = ROW_COUNT;

  INSERT INTO public.checks_daily (server_id, day, total, ups, degraded, downs, avg_latency_ms, max_latency_ms, uptime_pct)
  SELECT server_id, hour::date, sum(total), sum(ups), sum(degraded), sum(downs),
         round(avg(avg_latency_ms))::int, max(max_latency_ms),
         round((sum(ups)::numeric / NULLIF(sum(total),0)) * 100, 2)
  FROM public.checks_hourly WHERE hour >= since - interval '1 day'
  GROUP BY 1,2
  ON CONFLICT (server_id, day) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, degraded=EXCLUDED.degraded, downs=EXCLUDED.downs,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms, uptime_pct=EXCLUDED.uptime_pct;
  GET DIAGNOSTICS b = ROW_COUNT;

  INSERT INTO public.region_checks_hourly (server_id, region_code, hour, total, ups, downs, avg_latency_ms, max_latency_ms)
  SELECT server_id, region_code, date_trunc('hour', checked_at), count(*),
         count(*) FILTER (WHERE status='up'), count(*) FILTER (WHERE status<>'up'),
         round(avg(latency_ms))::int, max(latency_ms)
  FROM public.region_checks WHERE checked_at >= since
  GROUP BY 1,2,3
  ON CONFLICT (server_id, region_code, hour) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, downs=EXCLUDED.downs,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms;
  GET DIAGNOSTICS c = ROW_COUNT;

  INSERT INTO public.kuma_heartbeats_hourly (server_id, kind, hour, total, ok_count, avg_latency_ms, max_latency_ms)
  SELECT server_id, kind, date_trunc('hour', checked_at), count(*), count(*) FILTER (WHERE ok),
         round(avg(latency_ms))::int, max(latency_ms)
  FROM public.kuma_heartbeats WHERE checked_at >= since
  GROUP BY 1,2,3
  ON CONFLICT (server_id, kind, hour) DO UPDATE SET
    total=EXCLUDED.total, ok_count=EXCLUDED.ok_count,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms;
  GET DIAGNOSTICS d = ROW_COUNT;

  INSERT INTO public.kuma_heartbeats_daily (server_id, kind, day, total, ok_count, uptime_pct, avg_latency_ms)
  SELECT server_id, kind, hour::date, sum(total), sum(ok_count),
         round((sum(ok_count)::numeric / NULLIF(sum(total),0)) * 100, 2), round(avg(avg_latency_ms))::int
  FROM public.kuma_heartbeats_hourly WHERE hour >= since - interval '1 day'
  GROUP BY 1,2,3
  ON CONFLICT (server_id, kind, day) DO UPDATE SET
    total=EXCLUDED.total, ok_count=EXCLUDED.ok_count, uptime_pct=EXCLUDED.uptime_pct, avg_latency_ms=EXCLUDED.avg_latency_ms;
  GET DIAGNOSTICS e = ROW_COUNT;

  RETURN jsonb_build_object('checks_hourly',a,'checks_daily',b,'region_hourly',c,'kuma_hourly',d,'kuma_daily',e);
END; $$;

-- 5) RETENTION (dry-run capable, never touches incidents/alerts/catalog) ------
CREATE OR REPLACE FUNCTION public.purge_old_metrics(_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg jsonb;
  detail_days int; hourly_days int; daily_days int;
  cut_detail timestamptz; cut_hourly timestamptz; cut_daily date;
  n_checks bigint; n_region bigint; n_kuma bigint; n_dns bigint;
  n_h1 bigint; n_h2 bigint; n_h3 bigint; n_d1 bigint; n_d2 bigint;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key='retention';
  detail_days := COALESCE((cfg->>'detail_days')::int, 30);
  hourly_days := COALESCE((cfg->>'hourly_days')::int, 90);
  daily_days  := COALESCE((cfg->>'daily_days')::int, 730);
  cut_detail := now() - make_interval(days => detail_days);
  cut_hourly := now() - make_interval(days => hourly_days);
  cut_daily  := (now() - make_interval(days => daily_days))::date;

  -- safety: only purge detail that has already been rolled up
  PERFORM public.rollup_metrics(GREATEST(detail_days * 24, 24));

  SELECT count(*) INTO n_checks FROM public.checks WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_region FROM public.region_checks WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_kuma   FROM public.kuma_heartbeats WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_dns    FROM public.dns_snapshots WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_h1 FROM public.checks_hourly WHERE hour < cut_hourly;
  SELECT count(*) INTO n_h2 FROM public.region_checks_hourly WHERE hour < cut_hourly;
  SELECT count(*) INTO n_h3 FROM public.kuma_heartbeats_hourly WHERE hour < cut_hourly;
  SELECT count(*) INTO n_d1 FROM public.checks_daily WHERE day < cut_daily;
  SELECT count(*) INTO n_d2 FROM public.kuma_heartbeats_daily WHERE day < cut_daily;

  IF NOT _dry_run THEN
    DELETE FROM public.checks WHERE checked_at < cut_detail;
    DELETE FROM public.region_checks WHERE checked_at < cut_detail;
    DELETE FROM public.kuma_heartbeats WHERE checked_at < cut_detail;
    DELETE FROM public.dns_snapshots WHERE checked_at < cut_detail;
    DELETE FROM public.checks_hourly WHERE hour < cut_hourly;
    DELETE FROM public.region_checks_hourly WHERE hour < cut_hourly;
    DELETE FROM public.kuma_heartbeats_hourly WHERE hour < cut_hourly;
    DELETE FROM public.checks_daily WHERE day < cut_daily;
    DELETE FROM public.kuma_heartbeats_daily WHERE day < cut_daily;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', _dry_run,
    'cutoff_detail', cut_detail, 'cutoff_hourly', cut_hourly, 'cutoff_daily', cut_daily,
    'checks', n_checks, 'region_checks', n_region, 'kuma_heartbeats', n_kuma, 'dns_snapshots', n_dns,
    'checks_hourly', n_h1, 'region_checks_hourly', n_h2, 'kuma_heartbeats_hourly', n_h3,
    'checks_daily', n_d1, 'kuma_heartbeats_daily', n_d2
  );
END; $$;

-- 6) STORAGE MONITORING -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_storage_report()
RETURNS TABLE(table_name text, rows bigint, total_bytes bigint, total_pretty text, index_pretty text, inserts bigint, updates bigint, deletes bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.relname::text, s.n_live_tup, pg_total_relation_size(c.oid),
         pg_size_pretty(pg_total_relation_size(c.oid)), pg_size_pretty(pg_indexes_size(c.oid)),
         s.n_tup_ins, s.n_tup_upd, s.n_tup_del
  FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid
  WHERE s.schemaname = 'public'
  ORDER BY pg_total_relation_size(c.oid) DESC;
END; $$;

-- 7) SCHEDULES ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('rollup-metrics-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='rollup-metrics-hourly');
SELECT cron.unschedule('purge-old-metrics-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='purge-old-metrics-daily');
SELECT cron.schedule('rollup-metrics-hourly', '5 * * * *', $$ SELECT public.rollup_metrics(3); $$);
SELECT cron.schedule('purge-old-metrics-daily', '0 4 * * *', $$ SELECT public.purge_old_metrics(false); $$);