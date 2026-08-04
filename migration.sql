-- Adicionar coluna para créditos e indicação de revendedor pai
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS parent_reseller_id UUID REFERENCES public.profiles(id);

-- Tabela para planos personalizados de revendedores
CREATE TABLE IF NOT EXISTS public.reseller_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_plans TO authenticated;
GRANT ALL ON public.reseller_plans TO service_role;

ALTER TABLE public.reseller_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers can manage their own plans"
ON public.reseller_plans
FOR ALL
TO authenticated
USING (reseller_id = auth.uid());

CREATE POLICY "Users can see plans from their reseller"
ON public.reseller_plans
FOR SELECT
TO authenticated
USING (reseller_id = (SELECT parent_reseller_id FROM public.profiles WHERE id = auth.uid()));

-- Tabela para histórico de créditos
CREATE TABLE IF NOT EXISTS public.credit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'purchase', 'use', 'admin_add'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.credit_history TO authenticated;
GRANT ALL ON public.credit_history TO service_role;

ALTER TABLE public.credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit history"
ON public.credit_history
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Função para processar pagamento de créditos (será chamada pelo webhook do Mercado Pago)
CREATE OR REPLACE FUNCTION public.process_credit_purchase(p_user_id UUID, p_credits INTEGER, p_payment_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Adicionar créditos ao perfil
    UPDATE public.profiles
    SET credits = credits + p_credits
    WHERE id = p_user_id;

    -- Registrar no histórico
    INSERT INTO public.credit_history (user_id, amount, type, description)
    VALUES (p_user_id, p_credits, 'purchase', 'Compra de ' || p_credits || ' créditos (Pagamento: ' || p_payment_id || ')');
END;
$$;
