
CREATE OR REPLACE FUNCTION public.get_iptv_ranking(_limit int DEFAULT 100)
RETURNS TABLE(
  server_id uuid, name text, health_score int, channels int, movies int, series int,
  categories int, latency_ms int, api_ms int, synced_at timestamptz, is_mine boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (s.id)
      s.id AS sid, s.name AS sname, s.owner_id AS sowner,
      y.health_score AS hs, y.channels AS ch, y.movies AS mv, y.series AS se,
      y.categories AS ca, y.latency_ms AS lat, y.api_ms AS api, y.synced_at AS sa,
      y.login_ok AS lok, y.json_valid AS jok, y.error AS err
    FROM public.servers s
    JOIN public.iptv_syncs y ON y.server_id = s.id
    WHERE y.synced_at > now() - interval '48 hours'
    ORDER BY s.id, y.synced_at DESC
  )
  SELECT sid, sname, hs, ch, mv, se, ca, lat, api, sa, (sowner = auth.uid())
  FROM latest
  WHERE lok IS TRUE AND jok IS TRUE AND err IS NULL AND hs IS NOT NULL
  ORDER BY hs DESC NULLS LAST, ch DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

CREATE OR REPLACE FUNCTION public.get_iptv_server_rank(_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = _server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH r AS (SELECT * FROM public.get_iptv_ranking(200)),
  ranked AS (SELECT *, row_number() OVER (ORDER BY health_score DESC, channels DESC NULLS LAST) AS pos FROM r),
  agg AS (
    SELECT COUNT(*)::int AS total,
           AVG(COALESCE(channels,0)) AS avg_ch, AVG(COALESCE(movies,0)) AS avg_mv,
           AVG(COALESCE(series,0)) AS avg_se, AVG(NULLIF(latency_ms,0)) AS avg_lat,
           AVG(health_score) AS avg_hs
    FROM r
  )
  SELECT jsonb_build_object(
    'position', k.pos,
    'total', a.total,
    'health_score', k.health_score,
    'channels', k.channels, 'movies', k.movies, 'series', k.series, 'categories', k.categories,
    'latency_ms', k.latency_ms, 'api_ms', k.api_ms,
    'avg_channels', ROUND(COALESCE(a.avg_ch,0)), 'avg_movies', ROUND(COALESCE(a.avg_mv,0)),
    'avg_series', ROUND(COALESCE(a.avg_se,0)), 'avg_latency_ms', ROUND(COALESCE(a.avg_lat,0)),
    'avg_health', ROUND(COALESCE(a.avg_hs,0)),
    'content_vs_avg_pct', CASE
      WHEN COALESCE(a.avg_ch,0) + COALESCE(a.avg_mv,0) + COALESCE(a.avg_se,0) = 0 THEN NULL
      ELSE ROUND(((COALESCE(k.channels,0)+COALESCE(k.movies,0)+COALESCE(k.series,0))
        / NULLIF(a.avg_ch + a.avg_mv + a.avg_se,0) - 1) * 100)
    END
  ) INTO res
  FROM ranked k CROSS JOIN agg a
  WHERE k.server_id = _server_id;

  IF res IS NULL THEN
    RETURN jsonb_build_object('position', NULL, 'total', (SELECT COUNT(*) FROM public.get_iptv_ranking(200)));
  END IF;
  RETURN res;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_iptv_ranking(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_iptv_server_rank(uuid) TO authenticated;
