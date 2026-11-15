-- EMERGENCY ROLLBACK ONLY — RESTORES THE EXACT PRIOR ANON/PUBLIC GRANTS.
-- Use only if the new security restriction is proven to break a legitimate call.
BEGIN;
GRANT EXECUTE ON FUNCTION public.acquire_diagnostic_lock(text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_diagnostic_slot_v2(uuid, uuid, boolean, integer) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_iptv_availability() TO anon;
GRANT EXECUTE ON FUNCTION public.record_diagnostic_failure(uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_diagnostic_success(uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_diagnostic_lock(text) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_acquire_cron_lock(text, integer, text) TO PUBLIC, anon;
COMMIT;
