CREATE OR REPLACE FUNCTION public.get_iptv_ranking(_limit integer DEFAULT 100)
 RETURNS TABLE(server_id uuid, name text, health_score integer, channels integer, movies integer, series integer, categories integer, latency_ms integer, api_ms integer, synced_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
         sname,
         hs, ch, mv, se, ca, lat, api, sa, (sowner = auth.uid())
  FROM latest
  WHERE lok IS TRUE AND jok IS TRUE AND err IS NULL AND hs IS NOT NULL
  ORDER BY hs DESC NULLS LAST, ch DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$function$;