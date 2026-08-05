CREATE OR REPLACE FUNCTION public.transfer_credits_v2(_sender_id uuid, _recipient_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_credits INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    IF _amount <= 0 THEN
        RAISE EXCEPTION 'Valor inválido';
    END IF;

    -- Check if sender is admin
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin'
    ) INTO v_is_admin;

    -- Get sender wallet
    SELECT credits INTO v_sender_credits FROM public.reseller_wallet WHERE reseller_id = _sender_id;

    -- Admin bypasses credit check and deduction
    IF NOT v_is_admin THEN
        IF v_sender_credits IS NULL OR v_sender_credits < _amount THEN
            RAISE EXCEPTION 'Saldo insuficiente';
        END IF;

        -- Deduct from sender
        UPDATE public.reseller_wallet 
        SET credits = credits - _amount, updated_at = now()
        WHERE reseller_id = _sender_id;

        -- Log history for sender
        INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
        VALUES (_sender_id, -_amount, 'transfer_sent', 'Transferência enviada');
    END IF;

    -- Add to recipient
    INSERT INTO public.reseller_wallet (reseller_id, credits)
    VALUES (_recipient_id, _amount)
    ON CONFLICT (reseller_id) DO UPDATE 
    SET credits = public.reseller_wallet.credits + _amount, updated_at = now();

    -- Log history for recipient
    INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
    VALUES (_recipient_id, _amount, 'transfer_received', 'Transferência recebida');

    -- Auto-convert recipient to reseller/sub-reseller if they are not yet
    UPDATE public.profiles SET is_reseller = true WHERE id = _recipient_id;
END;
$$;
