
-- Revoke EXECUTE from PUBLIC on all security-definer functions and re-grant narrowly.

-- Public status functions (used by anon on /status/:slug)
REVOKE ALL ON FUNCTION public.get_public_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_checks(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;

-- Ranking: only authenticated users
REVOKE ALL ON FUNCTION public.get_stability_ranking(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stability_ranking(integer) TO authenticated;

-- has_role: used by RLS policies and by app; keep for authenticated only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- subscription_is_active: only server / authenticated
REVOKE ALL ON FUNCTION public.subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated, service_role;

-- generate_referral_code: internal only (used by trigger); no client access
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO service_role;

-- Admin-only functions: revoke from anon/authenticated (server calls use service_role or the SECURITY DEFINER internal check)
-- Keep authenticated access because the functions internally verify has_role(admin) and raise 'forbidden'.
REVOKE ALL ON FUNCTION public.get_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated, service_role;

-- finalize_approved_payment: only server (webhook uses service_role)
REVOKE ALL ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) TO service_role;

-- Trigger functions: internal only
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_referral_reward() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_duplicate_host() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_touch_updated_at() FROM PUBLIC, anon, authenticated;
