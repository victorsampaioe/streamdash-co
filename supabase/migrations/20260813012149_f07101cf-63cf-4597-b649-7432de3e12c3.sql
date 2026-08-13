CREATE OR REPLACE FUNCTION public.check_circuit_breaker(p_server_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_row public.diagnostic_circuit_breakers;
BEGIN
    SELECT * INTO v_row FROM public.diagnostic_circuit_breakers WHERE server_id = p_server_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'closed'; END IF;

    IF v_row.state = 'open' THEN
        IF v_row.next_test_at IS NOT NULL AND now() >= v_row.next_test_at THEN
            UPDATE public.diagnostic_circuit_breakers
            SET state = 'half_open',
                next_test_at = now() + interval '3 minutes',
                updated_at = now()
            WHERE server_id = p_server_id;
            RETURN 'half_open';
        END IF;
        RETURN 'open';
    END IF;

    RETURN COALESCE(v_row.state, 'closed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.check_circuit_breaker(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_circuit_breaker(UUID) TO service_role;