-- Helpers de mascaramento (não expõem dados de outros usuários ao navegador)
CREATE OR REPLACE FUNCTION public.mask_server_id(_id uuid, _owner uuid)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _owner = auth.uid() THEN _id
              ELSE md5(_id::text || 'sm-mask-v1')::uuid END;
$$;

CREATE OR REPLACE FUNCTION public.mask_server_name(_id uuid, _owner uuid, _name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _owner = auth.uid() THEN _name
              ELSE 'Servidor ' || upper(substr(md5(_id::text || 'sm-mask-v1'), 1, 5)) END;
$$;

GRANT EXECUTE ON FUNCTION public.mask_server_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_name(uuid, uuid, text) TO authenticated;

-- Ranking IPTV
CREATE OR REPLACE FUNCTION public.get_iptv_ranking(_limit integer DEFAULT 100)
 RETURNS TABLE(server_id uuid, name text, health_score integer, channels integer, movies integer, series integer, categories integer, latency_ms integer, api_ms integer, synced_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT public.mask_server_id(sid, sowner),
         public.mask_server_name(sid, sowner, sname),
         hs, ch, mv, se, ca, lat, api, sa, (sowner = auth.uid())
  FROM latest
  WHERE lok IS TRUE AND jok IS TRUE AND err IS NULL AND hs IS NOT NULL
  ORDER BY hs DESC NULLS LAST, ch DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$function$;

-- Ranking de instabilidade (só nome mascarado + métricas agregadas)
CREATE OR REPLACE FUNCTION public.get_stability_ranking(_limit integer DEFAULT 20)
 RETURNS TABLE(name text, avg_latency_ms numeric, max_latency_ms integer, down_count bigint, total_checks bigint, instability_score numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.mask_server_name(s.id, s.owner_id, s.name),
    ROUND(AVG(c.latency_ms)::numeric, 0),
    COALESCE(MAX(c.latency_ms), 0)::int,
    COUNT(*) FILTER (WHERE c.status <> 'up'),
    COUNT(*),
    ROUND(
      (COUNT(*) FILTER (WHERE c.status <> 'up')::numeric / NULLIF(COUNT(*),0)) * 100
      + (COALESCE(AVG(c.latency_ms), 0) / 100), 2)
  FROM public.checks c
  JOIN public.servers s ON s.id = c.server_id
  WHERE c.checked_at > now() - interval '24 hours'
  GROUP BY s.id, s.name, s.owner_id
  HAVING COUNT(*) >= 3
  ORDER BY 6 DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 100));
$function$;

-- Comparativo de servidores
CREATE OR REPLACE FUNCTION public.iptv_server_comparison(_limit integer DEFAULT 100)
 RETURNS TABLE(server_id uuid, name text, channels integer, movies integer, series integer, health_score integer, latency_ms integer, synced_at timestamp with time zone, growth_7d bigint, removed_7d bigint, is_mine boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT public.mask_server_id(s.id, s.owner_id),
         public.mask_server_name(s.id, s.owner_id, s.name),
         l.channels, l.movies, l.series, l.health_score, l.latency_ms, l.synced_at,
         COALESCE(g.added,0), COALESCE(g.removed,0), s.owner_id = auth.uid()
  FROM last_sync l
  JOIN servers s ON s.id = l.server_id
  LEFT JOIN growth g ON g.server_id = s.id
  ORDER BY COALESCE(l.health_score,0) DESC
  LIMIT GREATEST(_limit,1);
$function$;

-- Conteúdos recentes
CREATE OR REPLACE FUNCTION public.iptv_recent_titles(_kind text DEFAULT 'all'::text, _limit integer DEFAULT 40, _offset integer DEFAULT 0, _order text DEFAULT 'new'::text)
 RETURNS TABLE(title_key text, title text, kind text, first_seen_at timestamp with time zone, server_count integer, first_server text, mine_has boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT i.title_key, i.kind::text AS kind, min(i.name) AS title, i.server_id,
           min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE (_kind = 'all' OR i.kind::text = _kind) AND i.removed_at IS NULL
    GROUP BY i.title_key, i.kind, i.server_id
  ), agg AS (
    SELECT b.title_key, min(b.title) AS title, min(b.kind) AS kind,
           min(b.seen_at) AS first_seen_at,
           count(DISTINCT b.server_id)::int AS server_count,
           bool_or(s.owner_id = auth.uid()) AS mine_has,
           (array_agg(public.mask_server_name(s.id, s.owner_id, s.name) ORDER BY b.seen_at))[1] AS first_server
    FROM base b JOIN servers s ON s.id = b.server_id
    GROUP BY b.title_key
  )
  SELECT title_key, title, kind, first_seen_at, server_count, first_server, mine_has
  FROM agg
  ORDER BY CASE WHEN _order = 'old' THEN first_seen_at END ASC,
           CASE WHEN _order <> 'old' THEN first_seen_at END DESC
  LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0);
$function$;

-- Servidores que possuem um título
CREATE OR REPLACE FUNCTION public.iptv_title_servers(_title_key text)
 RETURNS TABLE(server_name text, seen_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.mask_server_name(s.id, s.owner_id, s.name), min(i.first_seen_at), bool_or(s.owner_id = auth.uid())
  FROM iptv_catalog_items i JOIN servers s ON s.id = i.server_id
  WHERE i.title_key = _title_key AND i.removed_at IS NULL
  GROUP BY s.id, s.name, s.owner_id
  ORDER BY 2 ASC;
$function$;

-- Busca de títulos
CREATE OR REPLACE FUNCTION public.iptv_find_title(_query text, _kind text DEFAULT 'vod'::text, _limit integer DEFAULT 20)
 RETURNS TABLE(title_key text, title text, kind text, server_count bigint, first_server text, first_seen_at timestamp with time zone, mine_has boolean, servers jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT lower(regexp_replace(trim(coalesce(_query,'')), '[^a-zA-Z0-9]+', ' ', 'g')) AS term
  ),
  hits AS (
    SELECT i.title_key, min(i.name) AS title, i.server_id, min(i.first_seen_at) AS seen_at
    FROM public.iptv_catalog_items i, q
    WHERE i.removed_at IS NULL AND i.kind::text = _kind
      AND length(q.term) >= 2 AND i.title_key LIKE '%' || q.term || '%'
    GROUP BY i.title_key, i.server_id
  ),
  joined AS (
    SELECT h.*, public.mask_server_name(s.id, s.owner_id, s.name) AS server_name,
           (s.owner_id = auth.uid()) AS is_mine
    FROM hits h JOIN public.servers s ON s.id = h.server_id
  )
  SELECT j.title_key, min(j.title), _kind, count(DISTINCT j.server_id),
         (array_agg(j.server_name ORDER BY j.seen_at))[1], min(j.seen_at), bool_or(j.is_mine),
         jsonb_agg(jsonb_build_object('server_name', j.server_name, 'seen_at', j.seen_at, 'is_mine', j.is_mine) ORDER BY j.seen_at)
  FROM joined j
  GROUP BY j.title_key
  ORDER BY min(j.seen_at) DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$function$;

-- Quem detectou primeiro
CREATE OR REPLACE FUNCTION public.iptv_first_detected(_kind text DEFAULT 'vod'::text, _days integer DEFAULT 14, _limit integer DEFAULT 20)
 RETURNS TABLE(title_key text, title text, kind text, servers jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    jsonb_agg(jsonb_build_object(
      'server_name', public.mask_server_name(s.id, s.owner_id, s.name),
      'seen_at', r.seen_at) ORDER BY r.seen_at)
  FROM recent r
  JOIN multi m ON m.title_key = r.title_key
  JOIN servers s ON s.id = r.server_id
  GROUP BY r.title_key
  ORDER BY min(r.seen_at) DESC
  LIMIT GREATEST(_limit,1);
$function$;