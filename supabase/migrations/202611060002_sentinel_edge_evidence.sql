-- Sentinel Edge: evidence-based status from two distinct measurement sources.
-- SECURITY INVOKER preserves RLS: customer sees only own servers, admin sees all.
CREATE OR REPLACE FUNCTION public.get_sentinel_edge_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = 'public'
AS $$
WITH fleet AS (
 SELECT s.id,s.name,s.current_status::text AS http_status,
        s.dns_status,s.dns_enabled,s.monitoring_paused,
        s.last_checked_at,s.last_dns_check_at
 FROM public.servers s
 WHERE s.monitoring_paused = false
), probes AS (
 SELECT f.*,
        origin.status AS origin_status,origin.checked_at AS origin_at,
        edge.status AS edge_status,edge.checked_at AS edge_at
 FROM fleet f
 LEFT JOIN LATERAL (
  SELECT rc.status::text AS status, rc.checked_at
  FROM public.region_checks rc
  WHERE rc.server_id = f.id AND rc.region_code = 'origin'
  ORDER BY rc.checked_at DESC LIMIT 1
 ) origin ON true
 LEFT JOIN LATERAL (
  SELECT rc.status::text AS status, rc.checked_at
  FROM public.region_checks rc
  WHERE rc.server_id = f.id AND rc.region_code = 'cf-edge'
  ORDER BY rc.checked_at DESC LIMIT 1
 ) edge ON true
), states AS (
 SELECT p.*,
        (origin_at > now() - interval '10 minutes') AS origin_fresh,
        (edge_at > now() - interval '10 minutes') AS edge_fresh,
        (last_checked_at > now() - interval '15 minutes') AS http_fresh,
        (dns_enabled = false OR last_dns_check_at > now() - interval '15 minutes') AS dns_fresh,
        CASE
         WHEN dns_enabled AND dns_status='offline' AND last_dns_check_at > now() - interval '15 minutes' THEN 'dns_offline'
         WHEN (origin_at > now() - interval '10 minutes')
          AND (edge_at > now() - interval '10 minutes')
          AND origin_status='down' AND edge_status='down' THEN 'confirmed_down'
         WHEN (origin_at > now() - interval '10 minutes')
          AND (edge_at > now() - interval '10 minutes')
          AND origin_status <> edge_status
          AND origin_status IN ('up','down')
          AND edge_status IN ('up','down') THEN 'disagreement'
         WHEN NOT (origin_at > now() - interval '10 minutes')
          OR NOT (edge_at > now() - interval '10 minutes') THEN 'insufficient_data'
         WHEN origin_status='up' AND edge_status='up' THEN 'confirmed_up'
         ELSE 'investigating'
        END AS verdict
 FROM probes p
), counts AS (
 SELECT COUNT(*)::int AS total,
 COUNT(*) FILTER (WHERE origin_fresh)::int AS origin_recent,
 COUNT(*) FILTER (WHERE edge_fresh)::int AS edge_recent,
 COUNT(*) FILTER (WHERE origin_fresh AND edge_fresh)::int AS two_recent,
 COUNT(*) FILTER (WHERE verdict='confirmed_down')::int AS confirmed_down,
 COUNT(*) FILTER (WHERE verdict='dns_offline')::int AS dns_offline,
 COUNT(*) FILTER (WHERE verdict='disagreement')::int AS disagreements,
 COUNT(*) FILTER (WHERE verdict='insufficient_data')::int AS missing_evidence,
 COUNT(*) FILTER (WHERE verdict='confirmed_up')::int AS confirmed_up,
 COUNT(*) FILTER (WHERE NOT http_fresh OR NOT dns_fresh)::int AS stale_primary
 FROM states
)
SELECT jsonb_build_object(
 'checked_at',now(),
 'coverage',to_jsonb(counts),
 'priority_servers',COALESCE((
  SELECT jsonb_agg(to_jsonb(x))
  FROM (
    SELECT id,name,verdict,http_status,dns_status,
           origin_status,origin_at,edge_status,edge_at,
           http_fresh,dns_fresh
    FROM states
    WHERE verdict IN ('dns_offline','confirmed_down','disagreement','insufficient_data')
    ORDER BY CASE verdict
      WHEN 'dns_offline' THEN 1 WHEN 'confirmed_down' THEN 2
      WHEN 'disagreement' THEN 3 ELSE 4 END, name
    LIMIT 30
  ) x
 ),'[]'::jsonb)
)
FROM counts;
$$;
REVOKE ALL ON FUNCTION public.get_sentinel_edge_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sentinel_edge_summary() TO authenticated;