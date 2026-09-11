GRANT SELECT ON public.signup_attempts TO authenticated;
GRANT SELECT, DELETE ON public.signup_blocks TO authenticated;

DROP POLICY IF EXISTS "Admins can delete signup blocks" ON public.signup_blocks;
CREATE POLICY "Admins can delete signup blocks"
  ON public.signup_blocks
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER FUNCTION public.admin_signup_security_report() SECURITY INVOKER;
ALTER FUNCTION public.admin_unblock_signup(text) SECURITY INVOKER;