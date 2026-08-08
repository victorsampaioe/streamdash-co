-- Fix payments table constraints and grants
ALTER TABLE public.payments ALTER COLUMN plan DROP NOT NULL;

-- Ensure payment_type has a check constraint if it doesn't already
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_type_check') THEN
        ALTER TABLE public.payments ADD CONSTRAINT payments_payment_type_check 
        CHECK (payment_type IN ('subscription', 'store'));
    END IF;
END $$;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
CREATE POLICY "Users can insert own payments" ON public.payments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Grants
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT SELECT ON public.store_products TO authenticated;
GRANT ALL ON public.store_products TO service_role;
