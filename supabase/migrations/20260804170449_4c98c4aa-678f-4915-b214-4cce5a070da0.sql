CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  my_code text;
  is_ref_admin boolean;
BEGIN
  -- Check if this is the first user
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  -- Generate referral code for the new user
  my_code := public.generate_referral_code();
  
  -- Check if a referral code was provided in metadata
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    -- Find the referrer profile
    SELECT p.id INTO referrer
    FROM public.profiles p
    WHERE p.referral_code = upper(ref_code)
    LIMIT 1;

    IF referrer IS NOT NULL THEN
      -- Check if referrer is an admin
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = referrer AND role = 'admin'
      ) INTO is_ref_admin;

      -- If not admin, check if subscription is active
      IF NOT is_ref_admin AND NOT public.subscription_is_active(referrer) THEN
        referrer := NULL;
      END IF;
    END IF;

    -- Avoid self-referral
    IF referrer = new.id THEN referrer := NULL; END IF;

    -- If code was provided but no valid referrer found, and it's not the first user, throw error
    IF referrer IS NULL AND NOT is_first THEN
      RAISE EXCEPTION 'Código de indicação inválido ou indicador sem painel ativo.';
    END IF;
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  -- Assign role (admin for first user, user for others)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  -- Register the referral if valid
  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;
