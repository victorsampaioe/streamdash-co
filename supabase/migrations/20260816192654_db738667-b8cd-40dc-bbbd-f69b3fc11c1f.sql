DROP POLICY IF EXISTS "Users can manage their own activities" ON public.player_activities;

CREATE POLICY "Resellers manage their client activities"
ON public.player_activities
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.player_sessions s WHERE s.id = player_activities.session_id AND s.reseller_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.player_sessions s WHERE s.id = player_activities.session_id AND s.reseller_id = auth.uid()));