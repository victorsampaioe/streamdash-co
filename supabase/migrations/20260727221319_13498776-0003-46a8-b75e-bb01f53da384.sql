
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

  -- Admins podem cadastrar qualquer host
  IF public.has_role(NEW.owner_id, 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.servers
    WHERE lower(trim(host)) = normalized_host
      AND owner_id <> NEW.owner_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO conflict_exists;

  IF conflict_exists THEN
    RAISE EXCEPTION 'Este host não está disponível para monitoramento. Contate o suporte se acredita que isso é um engano.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
