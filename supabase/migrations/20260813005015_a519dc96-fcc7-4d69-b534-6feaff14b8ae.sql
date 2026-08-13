CREATE OR REPLACE FUNCTION public.release_diagnostic_slot(p_user_id uuid, p_server_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.diagnostic_concurrency_control
  SET active_count = GREATEST(0, active_count - 1),
      updated_at = now()
  WHERE key IN ('user:' || p_user_id::text, 'server:' || p_server_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.release_diagnostic_slot(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_diagnostic_slot(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_diagnostic_slots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.diagnostic_concurrency_control
  SET active_count = 0,
      updated_at = now()
  WHERE updated_at < now() - interval '1 minute'
    AND active_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_diagnostic_slots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_diagnostic_slots() TO service_role;