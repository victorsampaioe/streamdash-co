-- Cloudflare HTTP checks become authoritative without counting missing checks as outages.
-- Internal invoker-rights function; no public access. DNS remains independent.
CREATE SCHEMA IF NOT EXISTS maintenance;
REVOKE ALL ON SCHEMA maintenance FROM PUBLIC;
CREATE OR REPLACE FUNCTION maintenance.reconcile_cf_http()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH sample AS (
 SELECT r.*,row_number() over(partition by r.server_id order by r.checked_at desc,r.id desc) rn
 FROM public.region_checks r WHERE r.region_code='cf-edge' AND r.checked_at>now()-interval '40 minutes'
), latest AS (
 SELECT server_id,max(status) filter(where rn=1) a,max(status) filter(where rn=2) b,
 max(status) filter(where rn=3) c,max(checked_at) filter(where rn=1) at,
 max(checked_at) filter(where rn=3) third,
 max(http_status) filter(where rn=1) http,max(latency_ms) filter(where rn=1) latency,
 max(error) filter(where rn=1) error
 FROM sample WHERE rn<=3 GROUP BY server_id
), verdict AS (
 SELECT s.id,s.current_status::text previous,l.at,l.http,l.latency,l.error,
 CASE WHEN l.a='down' AND l.b='down' AND l.c='down' AND l.third>now()-interval '35 minutes'
  AND NOT EXISTS(SELECT 1 FROM public.region_checks x WHERE x.server_id=s.id
   AND x.region_code<>'cf-edge' AND x.status='up' AND x.checked_at>now()-interval '7 minutes')
 THEN 'down'
 WHEN l.a='down' THEN 'degraded'
 WHEN l.a='up' AND (s.current_status='down' OR EXISTS(
  SELECT 1 FROM public.incidents i WHERE i.server_id=s.id AND i.incident_type='server' AND i.ended_at IS NULL))
  AND l.b IS DISTINCT FROM 'up' THEN 'degraded'
 WHEN l.a='up' THEN 'up'
 WHEN l.a='degraded' THEN 'degraded' ELSE 'unknown' END status
 FROM latest l JOIN public.servers s ON s.id=l.server_id
 WHERE s.monitoring_paused=false AND l.at>coalesce(s.last_checked_at,'epoch'::timestamptz)
 AND l.at>now()-interval '15 minutes'
), modified AS (
 UPDATE public.servers s SET current_status=v.status::public.server_status,
 last_checked_at=v.at,last_http_status=v.http,last_latency_ms=v.latency,
 last_error=CASE WHEN v.status='up' THEN NULL ELSE coalesce(v.error,
  CASE WHEN v.http>=400 THEN 'HTTP '||v.http ELSE 'Falha HTTP observada na Cloudflare' END) END,
 last_state_change_at=CASE WHEN v.previous<>v.status THEN v.at ELSE s.last_state_change_at END,
 consecutive_failures=CASE WHEN v.status='down' THEN 3 WHEN v.status='degraded' THEN 1 ELSE 0 END,
 last_success_at=CASE WHEN v.status='up' THEN v.at ELSE s.last_success_at END,
 last_failure_at=CASE WHEN v.status='down' THEN v.at ELSE s.last_failure_at END
 FROM verdict v WHERE s.id=v.id
 RETURNING s.id,v.previous,v.status,v.at
), incidents_opened AS (
 INSERT INTO public.incidents(server_id,reason,last_check_at,failure_count,regions,incident_type)
 SELECT id,'Falha HTTP confirmada em três verificações na Cloudflare',at,3,'Cloudflare Edge','server'
 FROM modified WHERE status='down' AND previous<>'down'
 ON CONFLICT DO NOTHING RETURNING id
), incidents_closed AS (
 UPDATE public.incidents i SET ended_at=m.at FROM modified m
 WHERE m.status='up' AND i.server_id=m.id AND i.incident_type='server' AND i.ended_at IS NULL
 RETURNING i.id
)
SELECT jsonb_build_object('updated',(SELECT count(*) FROM modified),
 'new_incidents',(SELECT count(*) FROM incidents_opened),
 'recoveries',(SELECT count(*) FROM incidents_closed),
 'source','cloudflare-regional-edge')
$function$;
REVOKE ALL ON FUNCTION maintenance.reconcile_cf_http() FROM PUBLIC;
SELECT cron.schedule('streammonitor-cloudflare-http-primary','* * * * *','select maintenance.reconcile_cf_http()');
