-- Fix RLS policy for player_settings to allow resellers to manage their own settings
-- The current policy is: auth.uid() = profile_id
-- We need to ensure that 'authenticated' users (resellers) can indeed perform all actions.
-- The policy already uses auth.uid() = profile_id which is correct for individual ownership.
-- However, we will recreate it to ensure it's applied correctly to all operations.

DROP POLICY IF EXISTS "Users can manage their own player settings" ON public.player_settings;

CREATE POLICY "Users can manage their own player settings"
ON public.player_settings
FOR ALL
TO authenticated
USING (auth.uid() = profile_id)
WITH CHECK (auth.uid() = profile_id);

-- Also ensure GRANTs are robust
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_settings TO authenticated;
GRANT ALL ON public.player_settings TO service_role;
