
-- Garantir permissão de execução nas funções administrativas
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated;

-- Garantir acesso às tabelas de revenda e créditos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_requests TO authenticated;

-- Garantir que o service_role tenha tudo
GRANT ALL ON public.credit_history TO service_role;
GRANT ALL ON public.reseller_plans TO service_role;
GRANT ALL ON public.referrals TO service_role;
GRANT ALL ON public.payout_requests TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.subscriptions TO service_role;

-- Corrigir possíveis falhas de RLS nas tabelas de revenda
ALTER TABLE public.credit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own credit history" ON public.credit_history;
CREATE POLICY "Users can view their own credit history" ON public.credit_history 
FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.reseller_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Resellers can manage their own plans" ON public.reseller_plans;
CREATE POLICY "Resellers can manage their own plans" ON public.reseller_plans 
FOR ALL TO authenticated USING (auth.uid() = reseller_id);
