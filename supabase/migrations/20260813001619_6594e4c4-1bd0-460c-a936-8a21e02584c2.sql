-- 1. Tabela de controle de concorrência e rate limit
CREATE TABLE IF NOT EXISTS public.diagnostic_concurrency_control (
    key TEXT PRIMARY KEY, -- 'user:{id}' ou 'server:{id}'
    active_count INTEGER DEFAULT 0,
    count_20s INTEGER DEFAULT 0,
    count_10m INTEGER DEFAULT 0,
    count_1h INTEGER DEFAULT 0,
    last_window_reset_20s TIMESTAMPTZ DEFAULT now(),
    last_window_reset_10m TIMESTAMPTZ DEFAULT now(),
    last_window_reset_1h TIMESTAMPTZ DEFAULT now(),
    last_request_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostic_concurrency_control TO authenticated;
GRANT ALL ON public.diagnostic_concurrency_control TO service_role;

ALTER TABLE public.diagnostic_concurrency_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins only" ON public.diagnostic_concurrency_control
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Lógica de Circuit Breaker Degradação
CREATE OR REPLACE FUNCTION public.get_server_concurrency_limit(p_server_id UUID, p_base_limit INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_fail_count INTEGER;
    v_state TEXT;
BEGIN
    SELECT state, fail_count INTO v_state, v_fail_count
    FROM public.diagnostic_circuit_breakers
    WHERE server_id = p_server_id;

    IF NOT FOUND OR v_state = 'closed' THEN
        RETURN p_base_limit;
    END IF;

    IF v_state = 'half-open' OR v_fail_count > 0 THEN
        RETURN 1; -- Redução para 1 simultâneo
    END IF;

    RETURN p_base_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função acquire_diagnostic_slot_v2
CREATE OR REPLACE FUNCTION public.acquire_diagnostic_slot_v2(
    p_user_id UUID, 
    p_server_id UUID, 
    p_is_admin BOOLEAN,
    p_max_server_concurrent INTEGER DEFAULT 2
)
RETURNS JSONB AS $$
DECLARE
    v_user_key TEXT := 'user:' || p_user_id::text;
    v_server_key TEXT := 'server:' || p_server_id::text;
    v_user_row public.diagnostic_concurrency_control;
    v_server_count INTEGER;
    v_now TIMESTAMPTZ := now();
    v_effective_server_limit INTEGER;
    
    v_limit_20s INTEGER := 1;
    v_limit_10m INTEGER := 10;
    v_limit_1h INTEGER := 30;
    
    v_wait_time TEXT;
BEGIN
    IF p_is_admin THEN
        v_limit_20s := 5;
        v_limit_10m := 50;
        v_limit_1h := 200;
    END IF;

    INSERT INTO public.diagnostic_concurrency_control (key, active_count, last_request_at, updated_at)
    VALUES (v_user_key, 0, v_now, v_now)
    ON CONFLICT (key) DO NOTHING;
    
    SELECT * INTO v_user_row FROM public.diagnostic_concurrency_control WHERE key = v_user_key FOR UPDATE;

    IF v_user_row.active_count >= 1 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'concurrency', 'message', 'Por favor, aguarde o teste anterior terminar.');
    END IF;

    IF v_now - v_user_row.last_window_reset_20s >= interval '20 seconds' THEN
        v_user_row.count_20s := 0;
        v_user_row.last_window_reset_20s := v_now;
    END IF;
    IF v_now - v_user_row.last_window_reset_10m >= interval '10 minutes' THEN
        v_user_row.count_10m := 0;
        v_user_row.last_window_reset_10m := v_now;
    END IF;
    IF v_now - v_user_row.last_window_reset_1h >= interval '1 hour' THEN
        v_user_row.count_1h := 0;
        v_user_row.last_window_reset_1h := v_now;
    END IF;

    IF v_user_row.count_20s >= v_limit_20s THEN
        v_wait_time := ceil(extract(epoch from (v_user_row.last_window_reset_20s + interval '20 seconds' - v_now)))::text;
        RETURN jsonb_build_object('success', false, 'reason', 'rate_limit', 'message', 'Muitos testes seguidos. Tente novamente em ' || v_wait_time || ' segundos.');
    END IF;
    IF v_user_row.count_10m >= v_limit_10m THEN
        RETURN jsonb_build_object('success', false, 'reason', 'rate_limit', 'message', 'Limite de 10 diagnósticos por 10 minutos atingido.');
    END IF;
    IF v_user_row.count_1h >= v_limit_1h THEN
        RETURN jsonb_build_object('success', false, 'reason', 'rate_limit', 'message', 'Limite de 30 diagnósticos por hora atingido.');
    END IF;

    v_effective_server_limit := public.get_server_concurrency_limit(p_server_id, p_max_server_concurrent);
    
    INSERT INTO public.diagnostic_concurrency_control (key, active_count, last_request_at, updated_at)
    VALUES (v_server_key, 0, v_now, v_now)
    ON CONFLICT (key) DO NOTHING;
    
    SELECT active_count INTO v_server_count FROM public.diagnostic_concurrency_control WHERE key = v_server_key FOR UPDATE;

    IF v_server_count >= v_effective_server_limit THEN
        RETURN jsonb_build_object('success', false, 'reason', 'server_busy', 'message', 'O servidor IPTV está ocupado processando outros testes. Tente em instantes.');
    END IF;
    
    DECLARE
        v_last_srv_req TIMESTAMPTZ;
    BEGIN
        SELECT last_request_at INTO v_last_srv_req FROM public.diagnostic_concurrency_control WHERE key = v_server_key;
        IF v_now - v_last_srv_req < interval '5 seconds' THEN
             RETURN jsonb_build_object('success', false, 'reason', 'server_cooldown', 'message', 'Aguarde 5 segundos entre testes no mesmo servidor.');
        END IF;
    END;

    UPDATE public.diagnostic_concurrency_control SET 
        active_count = active_count + 1,
        count_20s = count_20s + 1,
        count_10m = count_10m + 1,
        count_1h = count_1h + 1,
        last_request_at = v_now,
        last_window_reset_20s = v_user_row.last_window_reset_20s,
        last_window_reset_10m = v_user_row.last_window_reset_10m,
        last_window_reset_1h = v_user_row.last_window_reset_1h,
        updated_at = v_now
    WHERE key = v_user_key;

    UPDATE public.diagnostic_concurrency_control SET 
        active_count = active_count + 1,
        last_request_at = v_now,
        updated_at = v_now
    WHERE key = v_server_key;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Redefinir funções de release antigas para apontar para a nova lógica se necessário
-- (Ou apenas manter a release_diagnostic_slot atual que funciona com active_count)
