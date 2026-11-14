
-- Globalping admin viewing a reseller-owned DNS is a valid operation.
-- Server-side caller must still pass admin authorization, this SQL function
-- is executable by service_role only and preserves the same ownership rule.
CREATE OR REPLACE FUNCTION public.streammonitor_reserve_globalping_run(
  p_user_id uuid,p_server_id uuid,p_target text
) RETURNS TABLE(run_id uuid,is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  existing_id uuid;
  hour_probes integer;
  day_count integer;
  newest_host text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(183940814);
  SELECT split_part(regexp_replace(s.host,'^https?://','','i'),':',1)
  INTO newest_host
  FROM public.servers s
  WHERE s.id=p_server_id
    AND (
      s.owner_id=p_user_id OR EXISTS (
        SELECT 1 FROM public.user_roles u
        WHERE u.user_id=p_user_id AND u.role='admin'
      )
    );
  IF newest_host IS NULL OR newest_host <> p_target
  THEN RAISE EXCEPTION 'dns_not_owned_or_changed'; END IF;

  SELECT r.id INTO existing_id
  FROM public.globalping_dns_runs r
  WHERE r.server_id=p_server_id
    AND r.user_id=p_user_id
    AND r.target_host=p_target
    AND r.status IN ('reserved','starting','in-progress','finished')
    AND r.created_at>now()-interval '10 minutes'
  ORDER BY r.created_at DESC LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_id,false;
    RETURN;
  END IF;
  SELECT COALESCE(sum(r.probes_count),0)::integer INTO hour_probes
  FROM public.globalping_dns_runs r
  WHERE r.created_at>now()-interval '1 hour';
  IF hour_probes+5>300
  THEN RAISE EXCEPTION 'globalping_shared_hourly_quota'; END IF;

  SELECT count(*)::integer INTO day_count
  FROM public.globalping_dns_runs r
  WHERE r.user_id=p_user_id AND r.created_at>now()-interval '24 hours';
  IF day_count>=12
  THEN RAISE EXCEPTION 'globalping_daily_quota'; END IF;

  INSERT INTO public.globalping_dns_runs(user_id,server_id,target_host,probes_count)
  VALUES(p_user_id,p_server_id,p_target,5)
  RETURNING id INTO existing_id;
  RETURN QUERY SELECT existing_id,true;
END $fn$;

REVOKE ALL ON FUNCTION public.streammonitor_reserve_globalping_run(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_reserve_globalping_run(uuid,uuid,text) TO service_role;
