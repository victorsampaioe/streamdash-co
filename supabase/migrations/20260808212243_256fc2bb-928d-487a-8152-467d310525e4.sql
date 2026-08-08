ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'subscription' CHECK (payment_type IN ('subscription', 'store'));
GRANT ALL ON public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
