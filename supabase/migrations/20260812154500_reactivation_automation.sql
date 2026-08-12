-- Tabela para controle de envios de reativação
CREATE TABLE public.reactivation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status TEXT NOT NULL, -- 'success', 'failed'
    error_message TEXT,
    message_version TEXT NOT NULL DEFAULT 'v1'
);

GRANT SELECT, INSERT ON public.reactivation_logs TO authenticated;
GRANT ALL ON public.reactivation_logs TO service_role;

ALTER TABLE public.reactivation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs"
ON public.reactivation_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tabela para configurações da campanha (opcional, para guardar a última mensagem)
CREATE TABLE public.reactivation_campaign_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    last_sent_at TIMESTAMPTZ,
    last_message TEXT,
    total_sent INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0
);

GRANT SELECT, UPDATE, INSERT ON public.reactivation_campaign_settings TO authenticated;
GRANT ALL ON public.reactivation_campaign_settings TO service_role;

ALTER TABLE public.reactivation_campaign_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage campaign settings"
ON public.reactivation_campaign_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Inicializa configurações
INSERT INTO public.reactivation_campaign_settings (id, total_sent) VALUES (gen_random_uuid(), 0);
