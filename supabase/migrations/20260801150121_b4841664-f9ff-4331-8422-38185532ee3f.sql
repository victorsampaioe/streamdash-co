-- servers: split owner ALL into read/update/delete + gated insert
DROP POLICY IF EXISTS "servers: owner all" ON public.servers;
CREATE POLICY "servers: owner select" ON public.servers FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "servers: owner update" ON public.servers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "servers: owner delete" ON public.servers FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "servers: owner insert active sub" ON public.servers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (public.subscription_is_active(auth.uid()) OR public.has_role(auth.uid(), 'admin')));

-- alert_channels: same treatment
DROP POLICY IF EXISTS "alerts: owner all" ON public.alert_channels;
CREATE POLICY "alerts: owner select" ON public.alert_channels FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "alerts: owner update" ON public.alert_channels FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "alerts: owner delete" ON public.alert_channels FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "alerts: owner insert active sub" ON public.alert_channels FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (public.subscription_is_active(auth.uid()) OR public.has_role(auth.uid(), 'admin')));