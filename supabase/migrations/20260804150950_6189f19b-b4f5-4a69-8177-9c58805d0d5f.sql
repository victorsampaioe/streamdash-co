-- Table to link payment plans to credit amounts
CREATE TABLE IF NOT EXISTS public.credit_pack_definitions (
    plan_id public.plan_type PRIMARY KEY,
    credits_amount INTEGER NOT NULL,
    price_cents INTEGER NOT NULL
);

INSERT INTO public.credit_pack_definitions (plan_id, credits_amount, price_cents)
VALUES 
    ('credits_10', 10, 12000),
    ('credits_30', 30, 30000),
    ('credits_50', 50, 40000)
ON CONFLICT (plan_id) DO UPDATE SET 
    credits_amount = EXCLUDED.credits_amount,
    price_cents = EXCLUDED.price_cents;

GRANT SELECT ON public.credit_pack_definitions TO authenticated;

-- Ensure triggers exist to handle credit pack approval
CREATE OR REPLACE FUNCTION public.handle_payment_approval()
RETURNS TRIGGER AS $$
DECLARE
    v_credits INTEGER;
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        -- Check if it's a credit pack
        SELECT credits_amount INTO v_credits
        FROM public.credit_pack_definitions
        WHERE plan_id = NEW.plan;

        IF FOUND THEN
            -- Add credits to user
            UPDATE public.profiles
            SET credits = COALESCE(credits, 0) + v_credits
            WHERE id = NEW.user_id;

            -- Log to history
            INSERT INTO public.credit_history (user_id, amount, type, description)
            VALUES (NEW.user_id, v_credits, 'purchase', 'Compra de ' || v_credits || ' créditos');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_approved_credits ON public.payments;
CREATE TRIGGER on_payment_approved_credits
    AFTER UPDATE ON public.payments
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
    EXECUTE FUNCTION public.handle_payment_approval();
