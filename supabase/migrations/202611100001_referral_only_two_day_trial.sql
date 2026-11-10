-- Teste gratuito de 48 horas exclusivo para novos cadastros com código de indicação válido.
-- Cadastros regulares exigem pagamento; assinaturas existentes não são modificadas.

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
  my_phone text;
  dup boolean;
  exp timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT trial_used, referred_by, nullif(regexp_replace(coalesce(phone,''), '\D', '', 'g'), '')
    INTO used, ref, my_phone
    FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'perfil não encontrado'; END IF;

  IF used THEN
    RAISE EXCEPTION 'Você já ativou o teste gratuito nesta conta. Não é possível ativar novamente — o acesso só é liberado com o pagamento de um plano.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = uid) THEN
    UPDATE public.profiles SET trial_used = true WHERE id = uid;
    RAISE EXCEPTION 'Você já ativou o teste gratuito nesta conta. Não é possível ativar novamente — o acesso só é liberado com o pagamento de um plano.';
  END IF;

  IF my_phone IS NOT NULL AND length(my_phone) >= 10 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> uid
        AND nullif(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), '') = my_phone
        AND (p.trial_used OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id))
    ) INTO dup;
    IF dup THEN
      UPDATE public.profiles SET trial_used = true WHERE id = uid;
      RAISE EXCEPTION 'Este telefone já utilizou o teste gratuito em outra conta. O teste é permitido apenas uma vez por pessoa — para continuar, assine um plano.';
    END IF;
  END IF;

  IF ref IS NULL THEN
    RAISE EXCEPTION 'O teste gratuito está disponível apenas para contas criadas com um código de indicação válido. Assine um plano para liberar o acesso.';
  END IF;

  exp := now() + interval '2 days';

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (uid, 'trial', 'trial', now(), exp);

  UPDATE public.profiles SET trial_used = true WHERE id = uid;

  UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = uid AND status = 'pending';

  RETURN jsonb_build_object('expires_at', exp);
END;
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

    -- Teste de 2 dias automático, exclusivo para cadastro novo com indicação.
    INSERT INTO public.subscriptions(user_id, plan, status, started_at, expires_at)
    VALUES (new.id, 'trial', 'trial', now(), now() + interval '2 days')
    ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.profiles SET trial_used = true, signup_bonus_days = 0 WHERE id = new.id;
    UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = new.id AND status = 'pending';
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.subscription_is_active(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.subscriptions
    where user_id = _user_id and expires_at > now() and status in ('trial','active')
  );
$function$;