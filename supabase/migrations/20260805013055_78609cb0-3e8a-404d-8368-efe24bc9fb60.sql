
-- Trigger function to automatically convert Client to Reseller when receiving credits
CREATE OR REPLACE FUNCTION public.handle_reseller_conversion_on_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is being given credits and is not already a reseller
  IF (NEW.credits > COALESCE(OLD.credits, 0)) AND NEW.is_reseller = false THEN
    NEW.is_reseller := true;
    
    -- Update the subscription to reflect the reseller status for UI consistency
    UPDATE public.subscriptions 
    SET plan = 'reseller'::public.plan_type,
        status = 'active'::public.subscription_status,
        expires_at = now() + interval '10 years'
    WHERE user_id = NEW.id;
    
    -- Log the conversion event
    INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
    VALUES (NEW.id, 0, 'adjustment', 'Conversão automática para Revendedor (créditos recebidos)');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_convert_to_reseller_on_credits ON public.profiles;
CREATE TRIGGER tr_convert_to_reseller_on_credits
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.credits IS DISTINCT FROM OLD.credits)
  EXECUTE FUNCTION public.handle_reseller_conversion_on_credits();

-- Update transfer_credits function to allow admins to transfer even if "expired"
CREATE OR REPLACE FUNCTION public.transfer_credits(
    _sender_id UUID,
    _recipient_id UUID,
    _amount INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_sender_credits INTEGER;
    v_recipient_parent_id UUID;
    v_sender_active BOOLEAN;
    v_sender_email TEXT;
    v_recipient_email TEXT;
    v_recipient_name TEXT;
    v_sender_name TEXT;
BEGIN
    -- 1. Validate amount
    IF _amount <= 0 THEN
        RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
    END IF;

    -- 2. Validate sender activity
    -- Admin is always active, others check credits/subscription
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin'
    ) INTO v_sender_active;

    IF NOT v_sender_active THEN
        SELECT public.subscription_is_active(_sender_id) INTO v_sender_active;
    END IF;

    IF NOT v_sender_active THEN
        RAISE EXCEPTION 'Sua conta precisa estar ativa para transferir créditos.';
    END IF;

    -- 3. Check sender credits
    SELECT credits, email, full_name INTO v_sender_credits, v_sender_email, v_sender_name FROM public.profiles WHERE id = _sender_id;
    
    -- Admin bypass check
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin') THEN
        IF v_sender_credits < _amount THEN
            RAISE EXCEPTION 'Saldo insuficiente para a transferência.';
        END IF;
    END IF;

    -- 4. Verify recipient belongs to sender's network
    -- Admin can transfer to ANYONE
    SELECT parent_id, email, full_name INTO v_recipient_parent_id, v_recipient_email, v_recipient_name FROM public.profiles WHERE id = _recipient_id;
    
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin') THEN
        IF v_recipient_parent_id IS NULL OR v_recipient_parent_id != _sender_id THEN
            RAISE EXCEPTION 'Você só pode transferir créditos para revendedores da sua própria rede.';
        END IF;
    END IF;

    -- 5. Perform transfer
    -- Sender side: only if not admin
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin') THEN
        UPDATE public.profiles SET credits = credits - _amount WHERE id = _sender_id;
    END IF;
    
    -- Recipient side: conversion is handled by the trigger
    UPDATE public.profiles SET credits = credits + _amount WHERE id = _recipient_id;

    -- 6. Log history (Log in both reseller_credit_history and credit_history for broad compatibility)
    INSERT INTO public.credit_history (user_id, amount, type, description)
    VALUES 
        (_sender_id, -_amount, 'transfer_out', 'Envio para: ' || COALESCE(v_recipient_name, v_recipient_email)),
        (_recipient_id, _amount, 'transfer_in', 'Origem: ' || COALESCE(v_sender_name, v_sender_email));

    INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
    VALUES 
        (_sender_id, -_amount, 'use', 'Envio para: ' || COALESCE(v_recipient_name, v_recipient_email)),
        (_recipient_id, _amount, 'purchase', 'Origem: ' || COALESCE(v_sender_name, v_sender_email));

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
