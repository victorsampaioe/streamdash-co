CREATE OR REPLACE FUNCTION public.radar_title_availability(_title_keys text[], _media text)
RETURNS TABLE(
  server_id uuid,
  name text,
  is_mine boolean,
  status text,
  last_sync_at timestamptz,
  found_at timestamptz,
  quality text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (s.id)
    public.mask_server_id(s.id, s.owner_id),
    COALESCE(s.name, 'Servidor Privado'),
    (s.owner_id = auth.uid()),
    s.current_status::text,
    s.last_iptv_sync_at,
    m.detected_at,
    CASE
      WHEN lower(coalesce(m.raw_name,'')) LIKE '%4k%' THEN '4K'
      WHEN lower(coalesce(m.raw_name,'')) LIKE '%fhd%' OR lower(coalesce(m.raw_name,'')) LIKE '%1080%' THEN 'FHD'
      ELSE 'HD'
    END
  FROM public.iptv_catalog_matches m
  JOIN public.iptv_global_catalog g ON g.id = m.catalog_id
  JOIN public.servers s ON s.id = m.server_id
  WHERE g.title_key = ANY(_title_keys)
    AND (_media IS NULL OR g.media_type = _media)
  ORDER BY s.id, m.detected_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.radar_title_availability(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.radar_title_availability(text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.radar_title_count(_title_keys text[], _media text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT m.server_id)::int
  FROM public.iptv_catalog_matches m
  JOIN public.iptv_global_catalog g ON g.id = m.catalog_id
  WHERE g.title_key = ANY(_title_keys)
    AND (_media IS NULL OR g.media_type = _media);
$$;

REVOKE EXECUTE ON FUNCTION public.radar_title_count(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.radar_title_count(text[], text) TO authenticated;