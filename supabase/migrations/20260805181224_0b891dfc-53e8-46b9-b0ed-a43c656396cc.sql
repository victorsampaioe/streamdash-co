-- Allow users to read their parent's profile (specifically for WhatsApp/Phone contact)
CREATE POLICY "profiles: children can read parent" ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS self
    WHERE self.id = auth.uid() AND self.parent_id = public.profiles.id
  )
);

GRANT SELECT ON public.profiles TO authenticated;