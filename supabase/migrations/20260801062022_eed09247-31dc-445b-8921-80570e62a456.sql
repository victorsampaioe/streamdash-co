-- Índices para acelerar buscas de catálogo
CREATE INDEX IF NOT EXISTS idx_iptv_catalog_items_title_key
  ON public.iptv_catalog_items (title_key) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_iptv_catalog_items_server_kind
  ON public.iptv_catalog_items (server_id, kind, removed_at);

-- Detector de Filmes: busca um título entre todos os servidores monitorados
-- e mostra quem tem, quem não tem, e quem detectou primeiro.
CREATE OR REPLACE FUNCTION public.iptv_find_title(_query text, _kind text DEFAULT 'vod', _limit integer DEFAULT 20)
RETURNS TABLE(
  title_key text,
  title text,
  kind text,
  server_count bigint,
  first_server text,
  first_seen_at timestamptz,
  mine_has boolean,
  servers jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT lower(regexp_replace(trim(coalesce(_query,'')), '[^a-zA-Z0-9]+', ' ', 'g')) AS term
  ),
  hits AS (
    SELECT i.title_key,
           min(i.name) AS title,
           i.server_id,
           min(i.first_seen_at) AS seen_at
    FROM public.iptv_catalog_items i, q
    WHERE i.removed_at IS NULL
      AND i.kind::text = _kind
      AND length(q.term) >= 2
      AND i.title_key LIKE '%' || q.term || '%'
    GROUP BY i.title_key, i.server_id
  ),
  joined AS (
    SELECT h.*, s.name AS server_name, (s.owner_id = auth.uid()) AS is_mine
    FROM hits h JOIN public.servers s ON s.id = h.server_id
  )
  SELECT j.title_key,
         min(j.title),
         _kind,
         count(DISTINCT j.server_id),
         (array_agg(j.server_name ORDER BY j.seen_at))[1],
         min(j.seen_at),
         bool_or(j.is_mine),
         jsonb_agg(jsonb_build_object(
           'server_name', j.server_name,
           'seen_at', j.seen_at,
           'is_mine', j.is_mine
         ) ORDER BY j.seen_at)
  FROM joined j
  GROUP BY j.title_key
  ORDER BY min(j.seen_at) DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) TO authenticated;