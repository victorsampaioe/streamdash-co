-- Migração para suporte a Rate Limits e Half-Open no Circuit Breaker

-- 1. Tabela de controle de concorrência e rate limit (apenas para o nó Core e Admin)
CREATE TABLE IF NOT EXISTS public.diagnostic_concurrency_control (
    key TEXT PRIMARY KEY, -- 'user:{id}' ou 'server:{id}'
    active_count INTEGER DEFAULT 0,
    last_request_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostic_concurrency_control TO authenticated;
GRANT ALL ON public.diagnostic_concurrency_control TO service_role;

ALTER TABLE public.diagnostic_concurrency_control ENABLE ROW LEVEL SECURITY;
-- Apenas sistema/admin acessa essa tabela
CREATE POLICY "Admins only" ON public.diagnostic_concurrency_control
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Atualizar Circuit Breaker para suportar expiração e transição automática
-- (O SQL já tinha next_test_at, mas vamos garantir uma função que consulte isso)

CREATE OR REPLACE FUNCTION public.check_circuit_breaker(p_server_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_state TEXT;
    v_next_test TIMESTAMPTZ;
BEGIN
    SELECT state, next_test_at INTO v_state, v_next_test
    FROM public.diagnostic_circuit_breakers
    WHERE server_id = p_server_id;

    IF NOT FOUND THEN
        RETURN 'closed';
    END IF;

    -- Lógica de Half-Open: se estiver aberto mas passou o tempo de teste
    IF v_state = 'open' AND v_next_test <= now() THEN
        UPDATE public.diagnostic_circuit_breakers
        SET state = 'half-open', updated_at = now()
        WHERE server_id = p_server_id;
        RETURN 'half-open';
    END IF;

    RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função atômica para gerenciar limites
CREATE OR REPLACE FUNCTION public.acquire_diagnostic_slot(p_user_id UUID, p_server_id UUID, p_max_user_concurrent INTEGER, p_max_server_concurrent INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_key TEXT := 'user:' || p_user_id::text;
    v_server_key TEXT := 'server:' || p_server_id::text;
    v_user_count INTEGER;
    v_server_count INTEGER;
BEGIN
    -- Upsert para o usuário
    INSERT INTO public.diagnostic_concurrency_control (key, active_count, updated_at)
    VALUES (v_user_key, 1, now())
    ON CONFLICT (key) DO UPDATE SET
        active_count = diagnostic_concurrency_control.active_count + 1,
        updated_at = now()
    RETURNING active_count INTO v_user_count;

    -- Upsert para o servidor
    INSERT INTO public.diagnostic_concurrency_control (key, active_count, updated_at)
    VALUES (v_server_key, 1, now())
    ON CONFLICT (key) DO UPDATE SET
        active_count = diagnostic_concurrency_control.active_count + 1,
        updated_at = now()
    RETURNING active_count INTO v_server_count;

    -- Validar se excedeu
    IF v_user_count > p_max_user_concurrent OR v_server_count > p_max_server_concurrent THEN
        -- Reverter incremento
        UPDATE public.diagnostic_concurrency_control SET active_count = active_count - 1 WHERE key IN (v_user_key, v_server_key);
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.release_diagnostic_slot(p_user_id UUID, p_server_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.diagnostic_concurrency_control
    SET active_count = GREATEST(0, active_count - 1), updated_at = now()
    WHERE key IN ('user:' || p_user_id::text, 'server:' || p_server_id::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
