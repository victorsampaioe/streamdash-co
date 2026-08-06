ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_account_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_owner_account_id ON public.profiles(owner_account_id);

-- Link every admin account to the main admin account
UPDATE public.profiles p
SET owner_account_id = (SELECT id FROM public.profiles WHERE email = 'victorsampaio133@gmail.com' LIMIT 1)
WHERE (SELECT id FROM public.profiles WHERE email = 'victorsampaio133@gmail.com' LIMIT 1) IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin');

CREATE OR REPLACE FUNCTION public.get_owner_account_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.id
       FROM public.profiles p
       JOIN public.profiles o ON o.id = p.owner_account_id
      WHERE p.id = _user_id),
    _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_account_id(uuid) TO authenticated, service_role;

CREATE POLICY "Admins can link accounts to an owner"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));