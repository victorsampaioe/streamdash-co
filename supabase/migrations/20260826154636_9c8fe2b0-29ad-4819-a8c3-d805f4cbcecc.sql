-- profiles: prevent privileged fields on self-insert
DROP POLICY IF EXISTS "profiles: insert self" ON public.profiles;
CREATE POLICY "profiles: insert self"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND coalesce(credits, 0) = 0
  AND coalesce(is_reseller, false) = false
  AND coalesce(trial_used, false) = false
  AND coalesce(signup_bonus_days, 2) = 2
  AND parent_id IS NULL
  AND owner_account_id IS NULL
);

-- listings: prevent moderation/highlight manipulation on insert
DROP POLICY IF EXISTS "listings: owner insert (active sub)" ON public.listings;
CREATE POLICY "listings: owner insert (active sub)"
ON public.listings
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.subscription_is_active(auth.uid())
  AND flagged = false
  AND highlight = false
);

-- hub_profiles: prevent self-verification / unban on insert
DROP POLICY IF EXISTS "hub_profiles: insert self" ON public.hub_profiles;
CREATE POLICY "hub_profiles: insert self"
ON public.hub_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND verification_status = 'none'::hub_verification_status
  AND verified_at IS NULL
  AND banned = false
);