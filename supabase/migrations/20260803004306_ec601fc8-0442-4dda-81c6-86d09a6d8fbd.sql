
-- ============ monitored_contents ============
CREATE TYPE public.content_status AS ENUM ('unknown','online','slow','unstable','offline','blocked','removed');
CREATE TYPE public.content_kind AS ENUM ('live','movie','series','episode');

CREATE TABLE public.monitored_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  reseller_id uuid NOT NULL,
  external_content_id text NOT NULL,
  content_type public.content_kind NOT NULL,
  name text NOT NULL,
  category_name text,
  cover_url text,
  container_ext text,
  parent_external_id text,
  season_number integer,
  episode_number integer,
  stream_url_encrypted text,
  current_status public.content_status NOT NULL DEFAULT 'unknown',
  is_favorite boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 5,
  consecutive_failures integer NOT NULL DEFAULT 0,
  response_time_ms integer,
  http_status integer,
  last_error text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_online_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, content_type, external_content_id)
);
CREATE INDEX idx_mc_server_status ON public.monitored_contents(server_id, current_status);
CREATE INDEX idx_mc_queue ON public.monitored_contents(server_id, last_checked_at NULLS FIRST);
CREATE INDEX idx_mc_reseller ON public.monitored_contents(reseller_id);

GRANT SELECT, UPDATE ON public.monitored_contents TO authenticated;
GRANT ALL ON public.monitored_contents TO service_role;
ALTER TABLE public.monitored_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own contents select" ON public.monitored_contents FOR SELECT TO authenticated
  USING (reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own contents update" ON public.monitored_contents FOR UPDATE TO authenticated
  USING (reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ============ content_checks ============
CREATE TABLE public.content_checks (
  id bigserial PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES public.monitored_contents(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  status public.content_status NOT NULL,
  http_status integer,
  response_time_ms integer,
  first_byte_time_ms integer,
  bytes_received integer,
  detected_format text,
  region text NOT NULL DEFAULT 'origin',
  error_message text,
  manual boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_content_time ON public.content_checks(content_id, checked_at DESC);
CREATE INDEX idx_cc_server_time ON public.content_checks(server_id, checked_at DESC);

GRANT SELECT ON public.content_checks TO authenticated;
GRANT ALL ON public.content_checks TO service_role;
ALTER TABLE public.content_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own checks select" ON public.content_checks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = content_checks.server_id
    AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- ============ content_alert_settings ============
CREATE TABLE public.content_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  notify_movies boolean NOT NULL DEFAULT true,
  notify_series boolean NOT NULL DEFAULT true,
  notify_channels boolean NOT NULL DEFAULT true,
  notify_recovery boolean NOT NULL DEFAULT true,
  notify_only_favorites boolean NOT NULL DEFAULT false,
  minimum_failures integer NOT NULL DEFAULT 3,
  telegram_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, server_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_alert_settings TO authenticated;
GRANT ALL ON public.content_alert_settings TO service_role;
ALTER TABLE public.content_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alert settings" ON public.content_alert_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());

-- ============ content_daily_summary ============
CREATE TABLE public.content_daily_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  total_contents integer NOT NULL DEFAULT 0,
  online_count integer NOT NULL DEFAULT 0,
  offline_count integer NOT NULL DEFAULT 0,
  unstable_count integer NOT NULL DEFAULT 0,
  slow_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  recovered_count integer NOT NULL DEFAULT 0,
  average_response_time integer,
  health_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, summary_date)
);
GRANT SELECT ON public.content_daily_summary TO authenticated;
GRANT ALL ON public.content_daily_summary TO service_role;
ALTER TABLE public.content_daily_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own summary select" ON public.content_daily_summary FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = content_daily_summary.server_id
    AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- ============ content_scan_runs (auditoria / falha geral) ============
CREATE TABLE public.content_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  tested integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  recovered integer NOT NULL DEFAULT 0,
  general_failure boolean NOT NULL DEFAULT false,
  triggered_by uuid,
  note text
);
CREATE INDEX idx_csr_server_time ON public.content_scan_runs(server_id, started_at DESC);
GRANT SELECT ON public.content_scan_runs TO authenticated;
GRANT ALL ON public.content_scan_runs TO service_role;
ALTER TABLE public.content_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs select" ON public.content_scan_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = content_scan_runs.server_id
    AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- updated_at triggers
CREATE TRIGGER trg_mc_touch BEFORE UPDATE ON public.monitored_contents
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_cas_touch BEFORE UPDATE ON public.content_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_cds_touch BEFORE UPDATE ON public.content_daily_summary
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ dashboard RPC ============
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

-- ============ retenção ============
CREATE OR REPLACE FUNCTION public.purge_content_checks(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.content_checks WHERE checked_at < now() - make_interval(days => GREATEST(_days,7));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
