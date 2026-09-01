DROP POLICY IF EXISTS "Public read for app config by reseller" ON public.reseller_app_config;

CREATE POLICY "Reseller reads own app config"
ON public.reseller_app_config
FOR SELECT
TO authenticated
USING (auth.uid() = reseller_id OR public.has_role(auth.uid(), 'admin'));

REVOKE SELECT ON public.reseller_app_config FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_app_config TO authenticated;
GRANT ALL ON public.reseller_app_config TO service_role;