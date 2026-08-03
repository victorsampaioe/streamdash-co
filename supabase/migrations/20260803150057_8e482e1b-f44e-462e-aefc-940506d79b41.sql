DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Funções do painel: apenas usuários autenticados
GRANT EXECUTE ON FUNCTION public.activate_free_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, public.plan_type, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_health_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_server(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_iptv_ranking(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_iptv_server_rank(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_region_stats(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workers_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stability_ranking(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hub_get_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hub_start_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_novelties(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_recent_titles(text, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_server_comparison(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_title_servers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_name(uuid, uuid, text) TO authenticated;

-- Funções realmente públicas
GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_dns_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reseller_page(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_referral_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_id(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mask_server_name(uuid, uuid, text) TO anon;