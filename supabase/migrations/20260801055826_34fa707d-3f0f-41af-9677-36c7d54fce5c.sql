REVOKE EXECUTE ON FUNCTION public.iptv_novelties(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iptv_server_comparison(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iptv_novelties(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_server_comparison(integer) TO authenticated;