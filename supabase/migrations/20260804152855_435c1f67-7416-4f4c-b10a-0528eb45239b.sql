-- Sub-reseller creation credit cost adjustment (1 -> 10)
-- No direct DB constraint change needed as logic is in server functions.

-- Add credit transfer function
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
    SELECT public.subscription_is_active(_sender_id) INTO v_sender_active;
    IF NOT v_sender_active THEN
        RAISE EXCEPTION 'Sua conta precisa estar ativa para transferir créditos.';
    END IF;

    -- 3. Check sender credits
    SELECT credits, email, full_name INTO v_sender_credits, v_sender_email, v_sender_name FROM public.profiles WHERE id = _sender_id;
    IF v_sender_credits < _amount THEN
        RAISE EXCEPTION 'Saldo insuficiente para a transferência.';
    END IF;

    -- 4. Verify recipient belongs to sender's network
    SELECT parent_id, email, full_name INTO v_recipient_parent_id, v_recipient_email, v_recipient_name FROM public.profiles WHERE id = _recipient_id;
    IF v_recipient_parent_id IS NULL OR v_recipient_parent_id != _sender_id THEN
        RAISE EXCEPTION 'Você só pode transferir créditos para revendedores da sua própria rede.';
    END IF;

    -- 5. Perform transfer
    UPDATE public.profiles SET credits = credits - _amount WHERE id = _sender_id;
    UPDATE public.profiles SET credits = credits + _amount WHERE id = _recipient_id;

    -- 6. Log history
    INSERT INTO public.credit_history (user_id, amount, type, description)
    VALUES 
        (_sender_id, -_amount, 'transfer_out', 'Envio para: ' || COALESCE(v_recipient_name, v_recipient_email)),
        (_recipient_id, _amount, 'transfer_in', 'Origem: ' || COALESCE(v_sender_name, v_sender_email));

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.transfer_credits(UUID, UUID, INTEGER) TO authenticated;
