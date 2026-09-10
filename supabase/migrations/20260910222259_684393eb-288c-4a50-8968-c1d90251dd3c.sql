DROP POLICY IF EXISTS "incidents: public read" ON public.incidents;
DROP POLICY IF EXISTS "incidents: public read auth" ON public.incidents;
REVOKE SELECT ON public.incidents FROM anon;