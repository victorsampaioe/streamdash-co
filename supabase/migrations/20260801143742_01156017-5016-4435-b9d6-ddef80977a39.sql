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
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT p.id INTO referrer
    FROM public.profiles p
    WHERE p.referral_code = upper(ref_code)
      AND public.subscription_is_active(p.id)
    LIMIT 1;
    IF referrer = new.id THEN referrer := NULL; END IF;

    -- Código informado precisa ser válido; sem código a conta é criada
    -- normalmente, porém sem direito ao teste gratuito.
    IF referrer IS NULL AND NOT is_first THEN
      RAISE EXCEPTION 'Código de indicação inválido ou indicador sem painel ativo.';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
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

CREATE OR REPLACE FUNCTION public.activate_free_trial()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  used boolean;
  ref uuid;
  exp timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT trial_used, referred_by INTO used, ref FROM public.profiles WHERE id = uid;
  IF used IS NULL THEN RAISE EXCEPTION 'perfil não encontrado'; END IF;
  IF ref IS NULL THEN
    RAISE EXCEPTION 'O teste gratuito está disponível apenas para contas criadas com um código de indicação. Assine um plano para liberar o acesso.';
  END IF;
  IF used THEN RAISE EXCEPTION 'O teste gratuito já foi utilizado nesta conta.'; END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = uid) THEN
    UPDATE public.profiles SET trial_used = true WHERE id = uid;
    RAISE EXCEPTION 'O teste gratuito já foi utilizado nesta conta.';
  END IF;

  exp := now() + interval '1 day';

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (uid, 'trial', 'trial', now(), exp);

  UPDATE public.profiles SET trial_used = true WHERE id = uid;

  UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = uid AND status = 'pending';

  RETURN jsonb_build_object('expires_at', exp);
END;
$function$;