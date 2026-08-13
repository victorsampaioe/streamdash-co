-- Correção de RLS e validações para persistência de histórico de diagnósticos

-- Garantir que a tabela permite INSERT pelo Core (via service_role ou auth.uid manual)
-- O Core AWS usa o anon key ou service_role, mas o código tenta passar userId.

-- 1. Ajustar a política para permitir que o sistema insira registros sem user_id (diagnósticos do Core)
DROP POLICY IF EXISTS "Users can see their own diagnostics" ON public.content_diagnostics;
CREATE POLICY "Users can see their own diagnostics" ON public.content_diagnostics
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);

-- 2. Garantir que o service_role pode fazer tudo
GRANT ALL ON public.content_diagnostics TO service_role;

-- 3. Permitir que authenticated insira se for o próprio ID
DROP POLICY IF EXISTS "Users can insert their own diagnostics" ON public.content_diagnostics;
CREATE POLICY "Users can insert their own diagnostics" ON public.content_diagnostics
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 4. Função auxiliar para o Core limpar slots órfãos (Housekeeping)
CREATE OR REPLACE FUNCTION public.cleanup_diagnostic_slots()
RETURNS VOID AS $$
BEGIN
    -- Remove entradas que não foram atualizadas há mais de 1 minuto (diagnósticos travados)
    UPDATE public.diagnostic_concurrency_control
    SET active_count = 0, updated_at = now()
    WHERE updated_at < now() - interval '1 minute' AND active_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
