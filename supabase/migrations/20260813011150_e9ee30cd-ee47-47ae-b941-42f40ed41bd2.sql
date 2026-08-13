DROP POLICY IF EXISTS "Users can view own diagnostics" ON public.content_diagnostics;
DROP POLICY IF EXISTS "Allow insert for everyone" ON public.content_diagnostics;

CREATE POLICY "Users can insert their own diagnostics"
ON public.content_diagnostics
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can insert diagnostics"
ON public.content_diagnostics
FOR INSERT
TO service_role
WITH CHECK (true);