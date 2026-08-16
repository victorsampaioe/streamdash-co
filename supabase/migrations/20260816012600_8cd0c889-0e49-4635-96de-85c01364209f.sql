-- 1. Ativar manualmente o usuário afetado
INSERT INTO public.user_roles (user_id, role)
VALUES ('9c15f368-a9f6-45b6-96b4-c8e0c8eca908', 'reseller')
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles 
SET is_reseller = true 
WHERE id = '9c15f368-a9f6-45b6-96b4-c8e0c8eca908';

-- 2. Criar função para automatizar a promoção a revendedor ao receber créditos
CREATE OR REPLACE FUNCTION public.handle_reseller_promotion_on_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Se o usuário recebeu créditos (> 0) e ainda não é revendedor/admin
    IF NEW.credits > 0 THEN
        -- Adicionar role de reseller
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.reseller_id, 'reseller')
        ON CONFLICT (user_id, role) DO NOTHING;

        -- Atualizar flag no profile
        UPDATE public.profiles 
        SET is_reseller = true 
        WHERE id = NEW.reseller_id AND is_reseller = false;
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Criar trigger na tabela reseller_wallet
DROP TRIGGER IF EXISTS trg_reseller_promotion ON public.reseller_wallet;
CREATE TRIGGER trg_reseller_promotion
AFTER INSERT OR UPDATE OF credits ON public.reseller_wallet
FOR EACH ROW
EXECUTE FUNCTION public.handle_reseller_promotion_on_credits();

-- 4. Corrigir outros usuários que já possuem créditos mas estão com a role errada (como user)
INSERT INTO public.user_roles (user_id, role)
SELECT reseller_id, 'reseller'::public.app_role
FROM public.reseller_wallet
WHERE credits > 0
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET is_reseller = true
WHERE id IN (SELECT reseller_id FROM public.reseller_wallet WHERE credits > 0)
AND is_reseller = false;