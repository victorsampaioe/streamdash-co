-- Cleanup Radar IPTV
DELETE FROM public.iptv_global_catalog
WHERE 
  media_type = 'live' 
  OR normalized_name ILIKE '%radio%' 
  OR tmdb_id IS NULL 
  OR poster_path IS NULL 
  OR poster_path = ''
  OR normalized_name = '';