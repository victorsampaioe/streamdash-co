-- SECURITY HOTFIX, 2026-11-15
-- Revoke unintended *anonymous* access to eight mutating SECURITY DEFINER RPCs.
-- Does not change function bodies, tables, data, authenticated or service_role grants.
-- Existing apps invoke these through server-side supabaseAdmin. Public read-only RPCs are intentionally unchanged.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

REVOKE EXECUTE ON FUNCTION public.acquire_diagnostic_lock(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.acquire_diagnostic_slot_v2(uuid, uuid, boolean, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_iptv_availability() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_diagnostic_failure(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_diagnostic_success(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_cron_lock(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_diagnostic_lock(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.try_acquire_cron_lock(text, integer, text) FROM PUBLIC, anon;

DO $verify$
DECLARE
  unexpected int;
BEGIN
  SELECT count(*) INTO unexpected FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND p.proname IN (
      'acquire_diagnostic_lock','acquire_diagnostic_slot_v2',
      'recalc_iptv_availability','record_diagnostic_failure',
      'record_diagnostic_success','release_cron_lock',
      'release_diagnostic_lock','try_acquire_cron_lock')
    AND (
      has_function_privilege('anon',p.oid,'EXECUTE')
      OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
    );
  IF unexpected > 0 THEN
    RAISE EXCEPTION 'Verification failed: % dangerous or broken RPC grants',unexpected;
  END IF;
END
$verify$;
COMMIT;

-- Readback verification is done separately after commit.
