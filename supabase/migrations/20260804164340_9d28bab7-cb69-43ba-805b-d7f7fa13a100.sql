-- Fix: Parents need to see children's profiles
DROP POLICY IF EXISTS "profiles: parent reads children" ON public.profiles;
CREATE POLICY "profiles: parent reads children" ON public.profiles
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

-- Fix: ensure parents can update credits for children (needed for transfers)
DROP POLICY IF EXISTS "profiles: parent updates children credits" ON public.profiles;
CREATE POLICY "profiles: parent updates children credits" ON public.profiles
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Grant execute on has_role to authenticated role just in case
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- Ensure the admin functions are correctly granted
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
