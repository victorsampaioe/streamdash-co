REVOKE EXECUTE ON FUNCTION public.iptv_recent_titles(text,integer,integer,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.iptv_title_servers(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.iptv_recent_titles(text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_title_servers(text) TO authenticated;