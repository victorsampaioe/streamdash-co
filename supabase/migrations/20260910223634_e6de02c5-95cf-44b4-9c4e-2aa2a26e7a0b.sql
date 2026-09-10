REVOKE EXECUTE ON FUNCTION public.stream_monitor_account_active(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stream_monitor_account_active(uuid) TO service_role;