GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_dns_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reseller_page(text) TO anon, authenticated;