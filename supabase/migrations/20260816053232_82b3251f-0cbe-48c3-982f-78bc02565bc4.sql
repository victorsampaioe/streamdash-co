-- 1) diagnostic_locks: enable RLS, no policies (service_role only)
ALTER TABLE public.diagnostic_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagnostic_locks FROM anon, authenticated;
GRANT ALL ON public.diagnostic_locks TO service_role;

-- 2) circuit breakers: restrict read to server owner or admin
DROP POLICY IF EXISTS "Everyone can see circuit breaker state" ON public.diagnostic_circuit_breakers;
CREATE POLICY "Owners or admins can see circuit breaker state"
ON public.diagnostic_circuit_breakers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = diagnostic_circuit_breakers.server_id
      AND s.owner_id = auth.uid()
  )
);

-- 3) fix mutable search_path
ALTER FUNCTION public.acquire_diagnostic_lock(p_lock_key text) SET search_path = public;
ALTER FUNCTION public.release_diagnostic_lock(p_lock_key text) SET search_path = public;
ALTER FUNCTION public.get_server_concurrency_limit(p_server_id uuid, p_base_limit integer) SET search_path = public;
ALTER FUNCTION public.handle_updated_at() SET search_path = public;