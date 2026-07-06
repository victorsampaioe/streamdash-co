
REVOKE EXECUTE ON FUNCTION public.subscription_is_active(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO service_role;
