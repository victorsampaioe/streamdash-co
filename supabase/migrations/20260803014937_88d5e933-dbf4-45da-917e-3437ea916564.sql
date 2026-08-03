CREATE OR REPLACE FUNCTION public.iptv_recent_titles(_kind text DEFAULT 'all', _limit integer DEFAULT 40, _offset integer DEFAULT 0, _order text DEFAULT 'new')
RETURNS TABLE(title_key text, title text, kind text, first_seen_at timestamptz, server_count integer, first_server text, mine_has boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT i.title_key, i.kind::text AS kind, min(i.name) AS title, i.server_id,
           min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE (_kind = 'all' OR i.kind::text = _kind)
      AND i.removed_at IS NULL
    GROUP BY i.title_key, i.kind, i.server_id
  ), agg AS (
    SELECT b.title_key, min(b.title) AS title, min(b.kind) AS kind,
           min(b.seen_at) AS first_seen_at,
           count(DISTINCT b.server_id)::int AS server_count,
           bool_or(s.owner_id = auth.uid()) AS mine_has,
           (array_agg(s.name ORDER BY b.seen_at))[1] AS first_server
    FROM base b JOIN servers s ON s.id = b.server_id
    GROUP BY b.title_key
  )
  SELECT title_key, title, kind, first_seen_at, server_count, first_server, mine_has
  FROM agg
  ORDER BY CASE WHEN _order = 'old' THEN first_seen_at END ASC,
           CASE WHEN _order <> 'old' THEN first_seen_at END DESC
  LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0);
$$;

CREATE OR REPLACE FUNCTION public.iptv_title_servers(_title_key text)
RETURNS TABLE(server_name text, seen_at timestamptz, is_mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.name, min(i.first_seen_at) AS seen_at, bool_or(s.owner_id = auth.uid())
  FROM iptv_catalog_items i JOIN servers s ON s.id = i.server_id
  WHERE i.title_key = _title_key AND i.removed_at IS NULL
  GROUP BY s.id, s.name
  ORDER BY 2 ASC;
$$;

GRANT EXECUTE ON FUNCTION public.iptv_recent_titles(text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_title_servers(text) TO authenticated;