-- Adiciona colunas necessárias para a máquina de estados e idempotência
ALTER TABLE public.servers 
ADD COLUMN IF NOT EXISTS recovery_alert_sent_at timestamptz;

-- Tabela para idempotência de alertas
CREATE TABLE IF NOT EXISTS public.alert_idempotency (
    id text PRIMARY KEY, -- server_id + incident_id + alert_type
    sent_at timestamptz NOT NULL DEFAULT now()
);

-- Permissões para alert_idempotency
GRANT SELECT, INSERT ON public.alert_idempotency TO authenticated;
GRANT ALL ON public.alert_idempotency TO service_role;

-- Habilita RLS
ALTER TABLE public.alert_idempotency ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (apenas para organização, já que o monitoring.server usa service_role)
CREATE POLICY "service_role_all" ON public.alert_idempotency FOR ALL TO service_role USING (true);

-- Limpeza automática de idempotência antiga (opcional, mas recomendado)
CREATE OR REPLACE FUNCTION public.cleanup_old_idempotency()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM public.alert_idempotency WHERE sent_at < now() - interval '30 days';
END;
$$;
