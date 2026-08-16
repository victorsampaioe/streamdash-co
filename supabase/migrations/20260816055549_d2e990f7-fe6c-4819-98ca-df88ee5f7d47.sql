
DROP POLICY IF EXISTS "profiles: children can read parent" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_reseller_contact(_reseller_id uuid DEFAULT NULL, _email text DEFAULT NULL)
RETURNS TABLE(full_name text, whatsapp text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, p.whatsapp, p.phone
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (
      (_reseller_id IS NOT NULL AND p.id = _reseller_id)
      OR (_reseller_id IS NULL AND _email IS NOT NULL AND p.email = _email)
    )
    AND (p.is_reseller = true OR public.has_role(p.id, 'admin'::app_role))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_reseller_contact(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_reseller_contact(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reseller_contact(uuid, text) TO service_role;
