CREATE TABLE IF NOT EXISTS public.activation_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    payment_id uuid REFERENCES public.payments(id),
    plan text,
    status_payment text,
    telegram_sent boolean DEFAULT false,
    telegram_error text,
    created_at timestamp with time zone DEFAULT now()
);

GRANT SELECT, INSERT ON public.activation_logs TO authenticated;
GRANT ALL ON public.activation_logs TO service_role;

ALTER TABLE public.activation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activation logs" 
ON public.activation_logs FOR SELECT 
TO authenticated 
USING (has_role(auth.uid(), 'admin'));
