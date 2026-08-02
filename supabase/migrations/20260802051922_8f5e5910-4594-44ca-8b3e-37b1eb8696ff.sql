REVOKE ALL ON FUNCTION public.rollup_metrics(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_metrics(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_storage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollup_metrics(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_metrics(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_report() TO authenticated, service_role;