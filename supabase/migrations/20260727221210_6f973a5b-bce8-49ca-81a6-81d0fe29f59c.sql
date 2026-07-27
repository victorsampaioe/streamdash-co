
CREATE OR REPLACE FUNCTION public.prevent_duplicate_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_host text;
  conflict_owner uuid;
BEGIN
  normalized_host := lower(trim(NEW.host));
  NEW.host := normalized_host;

  -- Admins podem cadastrar qualquer host
  IF public.has_role(NEW.owner_id, 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO conflict_owner
  FROM public.servers
  WHERE lower(trim(host)) = normalized_host
    AND owner_id <> NEW.owner_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF conflict_owner IS NOT NULL THEN
    RAISE EXCEPTION 'Este host/DNS já está sendo monitorado por outro usuário. Apenas administradores podem cadastrar hosts duplicados.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servers_prevent_duplicate_host_ins ON public.servers;
CREATE TRIGGER servers_prevent_duplicate_host_ins
BEFORE INSERT ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_host();

DROP TRIGGER IF EXISTS servers_prevent_duplicate_host_upd ON public.servers;
CREATE TRIGGER servers_prevent_duplicate_host_upd
BEFORE UPDATE OF host ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_host();
