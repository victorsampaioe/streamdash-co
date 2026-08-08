-- 1. Correct Verification document paths exposure (hub_profiles)
-- hub_profiles uses 'id' as the user's UUID (it's a profile table)
DROP POLICY IF EXISTS "hub_profiles: authenticated read all" ON public.hub_profiles;
CREATE POLICY "hub_profiles: owner and admin read"
ON public.hub_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id 
  OR public.has_role(auth.uid(), 'admin')
);

-- 2. Correct Rating comments exposure
DROP POLICY IF EXISTS "ratings: authenticated read" ON public.ratings;
CREATE POLICY "ratings: participants and admin read"
ON public.ratings
FOR SELECT
TO authenticated
USING (
  auth.uid() = rater_id 
  OR auth.uid() = ratee_id 
  OR public.has_role(auth.uid(), 'admin')
);

-- 3. Correct SECURITY DEFINER function permissions
-- Revoke PUBLIC execution to enforce least privilege
REVOKE EXECUTE ON FUNCTION public.transfer_credits(uuid, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_payment_approval() FROM PUBLIC;

-- Grant to specific roles
GRANT EXECUTE ON FUNCTION public.transfer_credits(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_payment_approval() TO service_role;

-- 4. Secure monitoring data (servers table uses 'owner_id')
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "servers: authenticated read" ON public.servers;
CREATE POLICY "servers: owner and admin access"
ON public.servers
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id 
  OR public.has_role(auth.uid(), 'admin')
);
