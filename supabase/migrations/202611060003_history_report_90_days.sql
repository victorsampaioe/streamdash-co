-- Sample-based report. Historical coverage is only what was actually collected.
CREATE OR REPLACE FUNCTION public.get_server_history_report(_server_id uuid, _days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='public' AS $$
WITH visible AS (
 SELECT id,name FROM public.servers WHERE id = _server_id
), samples AS (
 SELECT c.checked_at,c.status::text AS status,c.latency_ms
 FROM public.checks c JOIN visible v ON v.id=c.server_id
 WHERE c.checked_at >= now() - make_interval(days=>LEAST(90,GREATEST(1,_days)))
), summary AS (
 SELECT count(*)::int AS sample_count,
 count(*) FILTER (WHERE status='up')::int AS ok,
 count(*) FILTER (WHERE status='down')::int AS down,
 count(*) FILTER (WHERE status='degraded')::int AS degraded,
 round(avg(latency_ms)::numeric,0)::int AS avg_latency,
 min(checked_at) AS first_observed,
 max(checked_at) AS last_observed FROM samples
), days AS (
 SELECT checked_at::date AS day,count(*)::int AS total,
 count(*) FILTER (WHERE status='up')::int AS up,
 count(*) FILTER (WHERE status='down')::int AS down,
 round(avg(latency_ms)::numeric,0)::int AS avg_latency
 FROM samples GROUP BY checked_at::date
)
SELECT CASE WHEN EXISTS(SELECT 1 FROM visible)
 THEN jsonb_build_object(
   'server_name',(SELECT name FROM visible LIMIT 1),
   'requested_days',LEAST(90,GREATEST(1,_days)),
   'summary',(SELECT to_jsonb(summary) FROM summary),
   'daily',COALESCE((SELECT jsonb_agg(to_jsonb(days) ORDER BY day) FROM days),'[]'::jsonb),
   'note','Percentual das amostras disponiveis, sem garantia de SLA nem cobertura de periodos sem medicoes.'
 ) ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.get_server_history_report(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_history_report(uuid,integer) TO authenticated;