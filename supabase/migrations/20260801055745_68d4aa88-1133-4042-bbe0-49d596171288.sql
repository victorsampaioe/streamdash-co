-- ============ Catálogo IPTV ============
CREATE TABLE public.iptv_catalog_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind iptv_stream_kind NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  title_key text NOT NULL,
  category text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, kind, external_id)
);
GRANT SELECT ON public.iptv_catalog_items TO authenticated;
GRANT ALL ON public.iptv_catalog_items TO service_role;
ALTER TABLE public.iptv_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own catalog" ON public.iptv_catalog_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE INDEX idx_catalog_items_server_kind ON public.iptv_catalog_items(server_id, kind);
CREATE INDEX idx_catalog_items_titlekey ON public.iptv_catalog_items(kind, title_key);
CREATE INDEX idx_catalog_items_first_seen ON public.iptv_catalog_items(first_seen_at DESC);

CREATE TRIGGER trg_catalog_items_touch BEFORE UPDATE ON public.iptv_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Mudanças do catálogo ============
CREATE TABLE public.iptv_catalog_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind iptv_stream_kind NOT NULL,
  action text NOT NULL CHECK (action IN ('added','removed')),
  external_id text,
  name text NOT NULL,
  category text,
  detected_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.iptv_catalog_changes TO authenticated;
GRANT ALL ON public.iptv_catalog_changes TO service_role;
ALTER TABLE public.iptv_catalog_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own catalog changes" ON public.iptv_catalog_changes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE INDEX idx_catalog_changes_server_time ON public.iptv_catalog_changes(server_id, detected_at DESC);
CREATE INDEX idx_catalog_changes_time ON public.iptv_catalog_changes(detected_at DESC);

-- ============ Histórico diário ============
CREATE TABLE public.iptv_catalog_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  day date NOT NULL,
  channels integer NOT NULL DEFAULT 0,
  movies integer NOT NULL DEFAULT 0,
  series integer NOT NULL DEFAULT 0,
  added_channels integer NOT NULL DEFAULT 0,
  added_movies integer NOT NULL DEFAULT 0,
  added_series integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  sync_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, day)
);
GRANT SELECT ON public.iptv_catalog_daily TO authenticated;
GRANT ALL ON public.iptv_catalog_daily TO service_role;
ALTER TABLE public.iptv_catalog_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own catalog history" ON public.iptv_catalog_daily
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE TRIGGER trg_catalog_daily_touch BEFORE UPDATE ON public.iptv_catalog_daily
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Estado do catálogo no servidor ============
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS catalog_hash text,
  ADD COLUMN IF NOT EXISTS catalog_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_sync_ms integer;

-- ============ RPCs ============

-- Novidades do usuário logado
CREATE OR REPLACE FUNCTION public.iptv_novelties(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH mine AS (SELECT id, name FROM servers WHERE owner_id = auth.uid()),
  ch AS (
    SELECT c.*, m.name AS server_name FROM iptv_catalog_changes c
    JOIN mine m ON m.id = c.server_id
    WHERE c.detected_at >= now() - make_interval(hours => GREATEST(_hours,1))
  )
  SELECT jsonb_build_object(
    'added_movies',   (SELECT count(*) FROM ch WHERE action='added' AND kind='vod'),
    'added_series',   (SELECT count(*) FROM ch WHERE action='added' AND kind='series'),
    'added_channels', (SELECT count(*) FROM ch WHERE action='added' AND kind='live'),
    'removed',        (SELECT count(*) FROM ch WHERE action='removed'),
    'items', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT server_name, kind::text AS kind, action, name, category, detected_at
        FROM ch ORDER BY detected_at DESC LIMIT 200
      ) x), '[]'::jsonb)
  );
$$;

-- Ranking de atualização (todos os servidores monitorados, apenas nome)
CREATE OR REPLACE FUNCTION public.iptv_update_ranking(_days integer DEFAULT 7, _limit integer DEFAULT 20)
RETURNS TABLE(server_id uuid, name text, added_movies bigint, added_series bigint, added_channels bigint, added_total bigint, is_mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name,
    count(*) FILTER (WHERE c.kind='vod'),
    count(*) FILTER (WHERE c.kind='series'),
    count(*) FILTER (WHERE c.kind='live'),
    count(*),
    s.owner_id = auth.uid()
  FROM iptv_catalog_changes c
  JOIN servers s ON s.id = c.server_id
  WHERE c.action='added' AND c.detected_at >= now() - make_interval(days => GREATEST(_days,1))
  GROUP BY s.id, s.name, s.owner_id
  ORDER BY count(*) DESC
  LIMIT GREATEST(_limit,1);
$$;

-- Quem adicionou primeiro (entre servidores monitorados)
CREATE OR REPLACE FUNCTION public.iptv_first_detected(_kind text DEFAULT 'vod', _days integer DEFAULT 14, _limit integer DEFAULT 20)
RETURNS TABLE(title_key text, title text, kind text, servers jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH recent AS (
    SELECT i.title_key, i.kind, min(i.name) AS title, i.server_id, min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE i.kind::text = _kind
      AND i.first_seen_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY i.title_key, i.kind, i.server_id
  ), multi AS (
    SELECT title_key FROM recent GROUP BY title_key HAVING count(DISTINCT server_id) > 1
  )
  SELECT r.title_key, min(r.title), _kind,
    jsonb_agg(jsonb_build_object('server_name', s.name, 'seen_at', r.seen_at) ORDER BY r.seen_at)
  FROM recent r
  JOIN multi m ON m.title_key = r.title_key
  JOIN servers s ON s.id = r.server_id
  GROUP BY r.title_key
  ORDER BY min(r.seen_at) DESC
  LIMIT GREATEST(_limit,1);
$$;

-- Comparativo entre servidores
CREATE OR REPLACE FUNCTION public.iptv_server_comparison(_limit integer DEFAULT 100)
RETURNS TABLE(
  server_id uuid, name text, channels integer, movies integer, series integer,
  health_score integer, latency_ms integer, synced_at timestamptz,
  growth_7d bigint, removed_7d bigint, is_mine boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH last_sync AS (
    SELECT DISTINCT ON (server_id) server_id, channels, movies, series, health_score, latency_ms, synced_at
    FROM iptv_syncs
    WHERE synced_at >= now() - interval '48 hours' AND login_ok
    ORDER BY server_id, synced_at DESC
  ), growth AS (
    SELECT server_id,
      count(*) FILTER (WHERE action='added') AS added,
      count(*) FILTER (WHERE action='removed') AS removed
    FROM iptv_catalog_changes
    WHERE detected_at >= now() - interval '7 days'
    GROUP BY server_id
  )
  SELECT s.id, s.name, l.channels, l.movies, l.series, l.health_score, l.latency_ms, l.synced_at,
         COALESCE(g.added,0), COALESCE(g.removed,0), s.owner_id = auth.uid()
  FROM last_sync l
  JOIN servers s ON s.id = l.server_id
  LEFT JOIN growth g ON g.server_id = s.id
  ORDER BY COALESCE(l.health_score,0) DESC
  LIMIT GREATEST(_limit,1);
$$;

GRANT EXECUTE ON FUNCTION public.iptv_novelties(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_server_comparison(integer) TO authenticated;