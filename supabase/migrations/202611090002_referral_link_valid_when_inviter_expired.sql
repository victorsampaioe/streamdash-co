-- Indicação de clientes novos permanece válida mesmo com assinatura expirada
-- do indicador. Crédito só é concedido quando o indicado paga.
CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.referral_code = upper(trim(_code))

  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  my_code text;
  is_ref_admin boolean;
  requested_username text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');
  requested_username := nullif(lower(trim(new.raw_user_meta_data->>'username')), '');

  IF requested_username IS NOT NULL AND requested_username !~ '^[a-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'Nome de usuário inválido.';
  END IF;

  IF ref_code IS NOT NULL THEN
    SELECT p.id INTO referrer
    FROM public.profiles p
    WHERE p.referral_code = upper(ref_code)
    LIMIT 1;

    -- Indicação permanece válida mesmo se o indicador estiver temporariamente
    -- sem assinatura: o crédito pode ser utilizado na próxima renovação.

    IF referrer = new.id THEN referrer := NULL; END IF;

    IF referrer IS NULL AND NOT is_first THEN
      RAISE EXCEPTION 'Código de indicação inválido ou indicador sem painel ativo.';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, username, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    requested_username,
    my_code,
    referrer
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;