REVOKE SELECT ON public.hub_profiles FROM authenticated;
GRANT SELECT (
  id, handle, bio, location, verification_status, verified_at,
  business_count, rating_avg, rating_count, created_at, updated_at
) ON public.hub_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hub_profiles TO authenticated;
GRANT ALL ON public.hub_profiles TO service_role;