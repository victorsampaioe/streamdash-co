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

  exp := now() + interval '1 day';

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (uid, 'trial', 'trial', now(), exp);

  UPDATE public.profiles SET trial_used = true WHERE id = uid;

  UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = uid AND status = 'pending';

  RETURN jsonb_build_object('expires_at', exp);
END;
$function$;