CREATE OR REPLACE FUNCTION public.prevent_duplicate_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_host text;
  conflict_exists boolean;
BEGIN
  normalized_host := lower(trim(NEW.host));
  NEW.host := normalized_host;

  -- A regra de duplicidade agora é igual para todos (Admin e Revendedores)
  -- Removemos o bloqueio rígido por trigger para permitir que a validação técnica (DNS/HTTP) seja o critério real no frontend.
  -- Permitimos o cadastro múltiplo do mesmo host por donos diferentes se necessário,
  -- pois o monitoramento é individual por conta/créditos.
  
  RETURN NEW;
END;
$$;