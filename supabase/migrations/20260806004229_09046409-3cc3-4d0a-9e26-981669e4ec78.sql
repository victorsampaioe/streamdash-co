-- 1. search_path
ALTER FUNCTION public.transfer_credits(uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.handle_payment_approval() SET search_path = public;
ALTER FUNCTION public.handle_reseller_conversion_on_credits() SET search_path = public;

-- 2. credit_pack_definitions RLS
GRANT SELECT ON public.credit_pack_definitions TO anon, authenticated;
GRANT ALL ON public.credit_pack_definitions TO service_role;
ALTER TABLE public.credit_pack_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit packs readable by all"
  ON public.credit_pack_definitions FOR SELECT USING (true);
CREATE POLICY "admins manage credit packs"
  ON public.credit_pack_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Remove unrestricted parent full-row update on profiles
DROP POLICY IF EXISTS "profiles: parent updates children credits" ON public.profiles;

-- 4. reseller_settings: stop exposing pix data to customers
DROP POLICY IF EXISTS "Customers can view their reseller settings" ON public.reseller_settings;

CREATE OR REPLACE FUNCTION public.get_parent_reseller_pricing(_reseller_id uuid)
RETURNS TABLE(reseller_id uuid, monthly_price_cents integer, quarterly_price_cents integer, annual_price_cents integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.reseller_id, s.monthly_price_cents, s.quarterly_price_cents, s.annual_price_cents
  FROM public.reseller_settings s
  WHERE s.reseller_id = _reseller_id
    AND (
      s.reseller_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.reseller_tree t
        WHERE t.user_id = auth.uid() AND t.parent_reseller_id = s.reseller_id
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_reseller_pricing(uuid) TO authenticated;