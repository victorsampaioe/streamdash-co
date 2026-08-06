CREATE OR REPLACE FUNCTION public.get_my_parent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_parent_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_parent_id() TO authenticated;

DROP POLICY IF EXISTS "profiles: children can read parent" ON public.profiles;
CREATE POLICY "profiles: children can read parent"
ON public.profiles FOR SELECT TO authenticated
USING (id = public.get_my_parent_id());