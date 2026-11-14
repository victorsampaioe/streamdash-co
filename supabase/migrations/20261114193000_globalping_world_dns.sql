
-- Globalping diagnostics. Token is held separately in Supabase Vault.
CREATE TABLE IF NOT EXISTS public.globalping_dns_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
 target_host text NOT NULL,
 measurement_id text,
 status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','starting','in-progress','finished','failed')),
 probes_count integer NOT NULL DEFAULT 5 CHECK (probes_count BETWEEN 1 AND 5),
 summary jsonb NOT NULL DEFAULT '[]'::jsonb,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS globalping_dns_owner_time_idx ON public.globalping_dns_runs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS globalping_dns_server_time_idx ON public.globalping_dns_runs(server_id,created_at DESC);
CREATE INDEX IF NOT EXISTS globalping_dns_time_idx ON public.globalping_dns_runs(created_at DESC);
ALTER TABLE public.globalping_dns_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.globalping_dns_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.globalping_dns_runs TO service_role;

-- Deliberately service-role-only. There is no client/API route that can read the Vault key.
CREATE OR REPLACE FUNCTION public.streammonitor_globalping_token_server_only()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $fn$
 SELECT decrypted_secret FROM vault.decrypted_secrets
 WHERE name = 'streammonitor_globalping_api_token'
 ORDER BY created_at DESC LIMIT 1
$fn$;
REVOKE ALL ON FUNCTION public.streammonitor_globalping_token_server_only()
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_globalping_token_server_only() TO service_role;

CREATE OR REPLACE FUNCTION public.streammonitor_reserve_globalping_run(
 p_user_id uuid,
 p_server_id uuid,
 p_target text
) RETURNS TABLE(run_id uuid, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE existing_id uuid;
DECLARE hour_probes integer;
DECLARE day_count integer;
DECLARE newest_host text;
BEGIN
 -- All billing / quota computations are in one locked transaction.
 PERFORM pg_catalog.pg_advisory_xact_lock(183940814);
 SELECT split_part(regexp_replace(host,'^https?://','','i'),':',1)
 INTO newest_host FROM public.servers WHERE id=p_server_id AND owner_id=p_user_id;
 IF newest_host IS NULL OR newest_host <> p_target
 THEN RAISE EXCEPTION 'dns_not_owned_or_changed'; END IF;
 SELECT r.id INTO existing_id FROM public.globalping_dns_runs r
 WHERE r.server_id=p_server_id AND r.user_id=p_user_id
 AND r.target_host=p_target
 AND r.status IN ('reserved','starting','in-progress','finished')
 AND r.created_at > now()-interval '10 minutes'
 ORDER BY r.created_at DESC LIMIT 1;
 IF existing_id IS NOT NULL THEN
   RETURN QUERY SELECT existing_id, false;
   RETURN;
 END IF;
 SELECT COALESCE(sum(r.probes_count),0)::integer INTO hour_probes
 FROM public.globalping_dns_runs r
 WHERE r.created_at > now()-interval '1 hour';
 IF hour_probes + 5 > 300
 THEN RAISE EXCEPTION 'globalping_shared_hourly_quota'; END IF;
 SELECT count(*)::integer INTO day_count
 FROM public.globalping_dns_runs r
 WHERE r.user_id=p_user_id AND r.created_at>now()-interval '24 hours';
 IF day_count >= 12
 THEN RAISE EXCEPTION 'globalping_daily_quota'; END IF;
 INSERT INTO public.globalping_dns_runs(user_id,server_id,target_host,probes_count)
 VALUES(p_user_id,p_server_id,p_target,5) RETURNING id INTO existing_id;
 RETURN QUERY SELECT existing_id,true;
END $fn$;
REVOKE ALL ON FUNCTION public.streammonitor_reserve_globalping_run(uuid,uuid,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_reserve_globalping_run(uuid,uuid,text)
 TO service_role;
