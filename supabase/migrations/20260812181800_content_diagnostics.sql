-- 1. Tabelas de Diagnóstico
CREATE TABLE public.content_diagnostics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('live', 'movie', 'series', 'episode')),
    status TEXT NOT NULL, -- 'working', 'slow', 'unstable', 'unavailable', 'server_unavailable', 'regional_issue', 'client_issue'
    ttfb_ms INTEGER,
    connection_ms INTEGER,
    bytes_read INTEGER,
    duration_ms INTEGER,
    codec TEXT,
    resolution TEXT,
    error_message TEXT,
    steps JSONB, -- Histórico dos steppers
    is_cached BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.diagnostic_circuit_breakers (
    server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half-open')),
    failure_count INTEGER DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    next_test_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Grants
GRANT SELECT, INSERT ON public.content_diagnostics TO authenticated;
GRANT ALL ON public.content_diagnostics TO service_role;

GRANT SELECT ON public.diagnostic_circuit_breakers TO authenticated;
GRANT ALL ON public.diagnostic_circuit_breakers TO service_role;

-- 3. RLS
ALTER TABLE public.content_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own diagnostics" ON public.content_diagnostics
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can see all diagnostics" ON public.content_diagnostics
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can see circuit breaker state" ON public.diagnostic_circuit_breakers
    FOR SELECT TO authenticated USING (true);

-- 4. Função para registrar falha e gerenciar circuit breaker (Admin/Service Role only)
CREATE OR REPLACE FUNCTION public.record_diagnostic_failure(p_server_id UUID)
RETURNS VOID AS $$
DECLARE
    v_failures INTEGER;
BEGIN
    INSERT INTO public.diagnostic_circuit_breakers (server_id, failure_count, last_failure_at, updated_at)
    VALUES (p_server_id, 1, now(), now())
    ON CONFLICT (server_id) DO UPDATE SET
        failure_count = diagnostic_circuit_breakers.failure_count + 1,
        last_failure_at = now(),
        updated_at = now()
    RETURNING failure_count INTO v_failures;

    IF v_failures >= 5 THEN
        UPDATE public.diagnostic_circuit_breakers
        SET state = 'open', opened_at = now(), next_test_at = now() + interval '3 minutes'
        WHERE server_id = p_server_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.record_diagnostic_success(p_server_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.diagnostic_circuit_breakers
    SET state = 'closed', failure_count = 0, opened_at = NULL, next_test_at = NULL, updated_at = now()
    WHERE server_id = p_server_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

