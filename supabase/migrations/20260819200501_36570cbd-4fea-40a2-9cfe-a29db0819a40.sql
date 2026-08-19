-- Revogar execução pública da função de validação de licença (Segurança Definer)
REVOKE ALL ON FUNCTION public.validate_android_play_access(uuid) FROM public;
REVOKE ALL ON FUNCTION public.validate_android_play_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_android_play_access(uuid) TO authenticated, service_role;

-- Política para que o próprio cliente ou o revendedor associado possa ver a associação
-- Como o Android usa um endpoint público com HMAC ou segredo interno, a política deve ser cuidadosa.
-- Por enquanto, restringimos ao Admin e Service Role para o fluxo do backend.
DROP POLICY IF EXISTS "Admins can view associations" ON public.android_client_associations;
CREATE POLICY "Admins and Service Role can manage associations" ON public.android_client_associations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
