REVOKE EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) TO authenticated, service_role;