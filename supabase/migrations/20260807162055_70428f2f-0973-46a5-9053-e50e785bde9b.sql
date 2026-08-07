
-- Helper: profiles privileged columns unchanged (or actor is admin)
CREATE OR REPLACE FUNCTION public.profiles_privileged_unchanged(
  _id uuid, _credits integer, _is_reseller boolean, _trial_used boolean,
  _signup_bonus_days integer, _parent_id uuid, _owner_account_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _id
          AND p.credits IS NOT DISTINCT FROM _credits
          AND p.is_reseller IS NOT DISTINCT FROM _is_reseller
          AND p.trial_used IS NOT DISTINCT FROM _trial_used
          AND p.signup_bonus_days IS NOT DISTINCT FROM _signup_bonus_days
          AND p.parent_id IS NOT DISTINCT FROM _parent_id
          AND p.owner_account_id IS NOT DISTINCT FROM _owner_account_id
      );
$$;

DROP POLICY IF EXISTS "profiles: user updates own" ON public.profiles;
CREATE POLICY "profiles: user updates own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND public.profiles_privileged_unchanged(
    id, credits, is_reseller, trial_used, signup_bonus_days, parent_id, owner_account_id
  )
);

-- Helper: hub_profiles moderation columns unchanged
CREATE OR REPLACE FUNCTION public.hub_profiles_moderation_unchanged(
  _id uuid, _verification_status hub_verification_status, _verified_at timestamptz, _banned boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.hub_profiles h
        WHERE h.id = _id
          AND h.verification_status IS NOT DISTINCT FROM _verification_status
          AND h.verified_at IS NOT DISTINCT FROM _verified_at
          AND h.banned IS NOT DISTINCT FROM _banned
      );
$$;

DROP POLICY IF EXISTS "hub_profiles: update self" ON public.hub_profiles;
CREATE POLICY "hub_profiles: update self"
ON public.hub_profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() AND banned = false)
WITH CHECK (
  id = auth.uid()
  AND public.hub_profiles_moderation_unchanged(id, verification_status, verified_at, banned)
);

-- Helper: listings moderation columns unchanged
CREATE OR REPLACE FUNCTION public.listings_moderation_unchanged(
  _id uuid, _flagged boolean, _highlight boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = _id
          AND l.flagged IS NOT DISTINCT FROM _flagged
          AND l.highlight IS NOT DISTINCT FROM _highlight
      );
$$;

DROP POLICY IF EXISTS "listings: owner update" ON public.listings;
CREATE POLICY "listings: owner update"
ON public.listings FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (
  author_id = auth.uid()
  AND public.listings_moderation_unchanged(id, flagged, highlight)
);
