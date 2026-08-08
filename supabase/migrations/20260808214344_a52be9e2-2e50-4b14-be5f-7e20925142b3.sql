-- Final cleanup and fix for SD functions and tables
DO $$
DECLARE
    func_record record;
BEGIN
    FOR func_record IN 
        SELECT p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.prosecdef = true
    LOOP
        -- Skip specific functions if needed, but here we enforce least privilege
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', func_record.proname, func_record.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Incidents
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incidents: authenticated read" ON public.incidents;
CREATE POLICY "incidents: owner and admin access"
ON public.incidents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.servers 
    WHERE servers.id = incidents.server_id 
    AND (servers.owner_id = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- Region checks
ALTER TABLE public.region_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "region_checks: authenticated read" ON public.region_checks;
CREATE POLICY "region_checks: owner and admin access"
ON public.region_checks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.servers 
    WHERE servers.id = region_checks.server_id 
    AND (servers.owner_id = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin')
);
