-- Security permission hardening, verified in the active Lovable Cloud DB on 2026-11-18.
-- All production call sites found for these diagnostics/cron operations run
-- on the server through supabaseAdmin. Never accept caller-supplied p_is_admin.
-- These grants/revocations are idempotent and safe if deployed again.
REVOKE EXECUTE ON FUNCTION public.acquire_diagnostic_slot_v2(uuid,uuid,boolean,integer) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.acquire_diagnostic_lock(text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.record_diagnostic_failure(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.record_diagnostic_success(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.release_diagnostic_lock(text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.release_cron_lock(text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_cron_lock(text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_iptv_availability() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.get_server_concurrency_limit(uuid,integer) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.acquire_diagnostic_slot_v2(uuid,uuid,boolean,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_diagnostic_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_diagnostic_failure(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_diagnostic_success(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_diagnostic_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_cron_lock(text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_iptv_availability() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_server_concurrency_limit(uuid,integer) TO service_role;

-- The already-existing public.api_consume_rate_limit function is restricted
-- to service_role and uses INSERT .. ON CONFLICT DO UPDATE (atomic counter).
-- Its permissions were confirmed live; no second function is created.
