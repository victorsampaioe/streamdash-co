CREATE TABLE IF NOT EXISTS public.reactivation_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    status text NOT NULL,
    message_version text,
    error_message text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reactivation_campaign_settings (
    id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid PRIMARY KEY,
    last_sent_at timestamptz,
    last_message text,
    total_sent integer DEFAULT 0,
    total_failed integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

INSERT INTO public.reactivation_campaign_settings (id)
VALUES ('00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.reactivation_logs TO authenticated;
GRANT ALL ON public.reactivation_logs TO service_role;
GRANT ALL ON public.reactivation_campaign_settings TO authenticated;
GRANT ALL ON public.reactivation_campaign_settings TO service_role;

ALTER TABLE public.reactivation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactivation_campaign_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage logs" ON public.reactivation_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage settings" ON public.reactivation_campaign_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
