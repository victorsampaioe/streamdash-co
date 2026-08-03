-- 1) Revoke anon EXECUTE on non-public SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.activate_free_trial() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, public.plan_type, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.content_health_overview(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_server(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_iptv_ranking(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_iptv_server_rank(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_region_stats(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workers_health() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hub_recompute_rating(uuid) FROM anon;

-- 2) Maintenance functions: system/admin only
REVOKE EXECUTE ON FUNCTION public.purge_content_checks(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_metrics(boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollup_metrics(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hub_recompute_rating(uuid) FROM authenticated;

-- 3) Trigger functions must not be directly callable
REVOKE EXECUTE ON FUNCTION public.tg_conversations_business_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_listings_rate_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_messages_flag_contact() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_profiles_create_hub_profile() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ratings_recompute() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_referral_reward() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_host() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_touch_updated_at() FROM anon, authenticated;

-- 4) Payment finalization is webhook/service only
REVOKE EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM anon, authenticated;