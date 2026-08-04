ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS server_group text;

CREATE TABLE public.dns_correlation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  group_key text NOT NULL,
  failed_host text,
  verdict text NOT NULL,
  confidence integer NOT NULL DEFAULT 0,
  online_count integer NOT NULL DEFAULT 0,
  offline_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  related jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  recovery_seconds integer
);

GRANT SELECT ON public.dns_correlation_events TO authenticated;
GRANT ALL ON public.dns_correlation_events TO service_role;

ALTER TABLE public.dns_correlation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own correlation events"
ON public.dns_correlation_events FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dns_corr_server ON public.dns_correlation_events (server_id, created_at DESC);
CREATE INDEX idx_dns_corr_group_open ON public.dns_correlation_events (group_key, recovered_at);

CREATE OR REPLACE FUNCTION public.get_correlation_overview(_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _group text;
  _rows jsonb;
  _total int;
  _online int;
  _offline int;
  _degraded int;
  _verdict text;
BEGIN
  SELECT owner_id, coalesce(nullif(btrim(server_group), ''), name)
    INTO _owner, _group
  FROM servers WHERE id = _server_id;

  IF _owner IS NULL THEN RETURN NULL; END IF;
  IF _owner <> auth.uid() AND NOT has_role(auth.uid(), 'admin') THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.name,
           'status', s.current_status,
           'latency_ms', s.last_latency_ms,
           'checked_at', s.last_checked_at,
           'is_current', s.id = _server_id
         ) ORDER BY s.name), '[]'::jsonb),
         count(*)::int,
         count(*) FILTER (WHERE s.current_status = 'up')::int,
         count(*) FILTER (WHERE s.current_status = 'down')::int,
         count(*) FILTER (WHERE s.current_status = 'degraded')::int
    INTO _rows, _total, _online, _offline, _degraded
  FROM servers s
  WHERE s.owner_id = _owner
    AND coalesce(nullif(btrim(s.server_group), ''), s.name) = _group;

  _verdict := CASE
    WHEN _offline = 0 THEN 'healthy'
    WHEN _offline >= _total THEN 'server_down'
    WHEN _offline = 1 AND _total > 1 THEN 'isolated'
    ELSE 'partial'
  END;

  RETURN jsonb_build_object(
    'group', _group,
    'total', _total,
    'online', _online,
    'offline', _offline,
    'degraded', _degraded,
    'verdict', _verdict,
    'dns', _rows
  );
END;
$$;