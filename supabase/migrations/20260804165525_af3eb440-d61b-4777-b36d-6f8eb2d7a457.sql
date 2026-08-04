
-- Grant EXECUTE on all critical admin functions to ensure the 'authenticated' role can call them
-- The functions themselves have internal "IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden';" checks.

-- 1. Core Admin Functions
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_report() TO authenticated;

-- 2. Payout Management
GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid, text) TO authenticated;

-- 3. Subscription Management
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, public.plan_type, integer) TO authenticated;

-- 4. Ensure Role Check is accessible
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 5. Fix potential RLS issue for admin browsing profiles
DROP POLICY IF EXISTS "profiles: admin reads all" ON public.profiles;
CREATE POLICY "profiles: admin reads all" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. Ensure admin can see all subscriptions
DROP POLICY IF EXISTS "subs: admin reads all" ON public.subscriptions;
CREATE POLICY "subs: admin reads all" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
