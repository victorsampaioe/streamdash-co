
-- Garante que o usuário admin principal tenha a role correta e créditos infinitos se necessário
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'brunohbibiano1@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Revoga acesso público às funções de monitoramento para garantir privacidade total
REVOKE ALL ON FUNCTION public.has_role FROM public;
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated, service_role;
