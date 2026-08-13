-- Migração para Itens 3 e 4 do Diagnóstico
-- 1. Permitir user_id nulo para diagnósticos disparados pelo sistema/Core
ALTER TABLE public.content_diagnostics ALTER COLUMN user_id DROP NOT NULL;

-- 2. Garantir permissões de acesso ao API Data (PostgREST)
GRANT ALL ON public.content_diagnostics TO authenticated;
GRANT ALL ON public.content_diagnostics TO service_role;

-- 3. Políticas RLS Robustas
ALTER TABLE public.content_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert for everyone" ON public.content_diagnostics;
CREATE POLICY "Allow insert for everyone" ON public.content_diagnostics 
FOR INSERT TO authenticated, service_role 
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own diagnostics" ON public.content_diagnostics;
CREATE POLICY "Users can view own diagnostics" ON public.content_diagnostics 
FOR SELECT TO authenticated 
USING (auth.uid() = user_id OR user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role));

-- 4. Função para Bloqueio Global (Deduplicação Cross-Worker)
CREATE TABLE IF NOT EXISTS public.diagnostic_locks (
    lock_key text PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now()
);

GRANT ALL ON public.diagnostic_locks TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acquire_diagnostic_lock(p_lock_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Limpar locks órfãos com mais de 30 segundos
    DELETE FROM public.diagnostic_locks WHERE created_at < now() - interval '30 seconds';
    
    INSERT INTO public.diagnostic_locks (lock_key) VALUES (p_lock_key);
    RETURN true;
EXCEPTION WHEN unique_violation THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_diagnostic_lock(p_lock_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.diagnostic_locks WHERE lock_key = p_lock_key;
END;
$$;
