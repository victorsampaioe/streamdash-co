-- Corrigir nome da coluna de failure_count na função de degradação
CREATE OR REPLACE FUNCTION public.get_server_concurrency_limit(p_server_id UUID, p_base_limit INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_fail_count INTEGER;
    v_state TEXT;
BEGIN
    SELECT state, failure_count INTO v_state, v_fail_count
    FROM public.diagnostic_circuit_breakers
    WHERE server_id = p_server_id;

    IF NOT FOUND OR v_state = 'closed' THEN
        RETURN p_base_limit;
    END IF;

    -- Se estiver em half-open ou tiver falhas acumuladas (degradação)
    -- failure_count > 0 indica que já houve erros recentes
    IF v_state = 'half-open' OR (v_fail_count IS NOT NULL AND v_fail_count > 0) THEN
        RETURN 1; -- Redução automática para 1 simultâneo
    END IF;

    RETURN p_base_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;