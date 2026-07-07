
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_bonus_days integer NOT NULL DEFAULT 10;

-- Set your custom code and bonus
UPDATE public.profiles
  SET referral_code = 'VICTOR', signup_bonus_days = 30
  WHERE email = 'victorsampaio133@gmail.com';

-- Update handle_new_user to use the referrer's signup_bonus_days
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  bonus int := 0;
  trial_days int := 30;
  my_code text;
BEGIN
  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT id, signup_bonus_days INTO referrer, bonus
      FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
    IF referrer IS NOT NULL AND referrer <> new.id THEN
      trial_days := 30 + COALESCE(bonus, 10);
    ELSE
      referrer := NULL;
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

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (new.id, 'trial', 'trial', now(), now() + (trial_days || ' days')::interval)
  ON CONFLICT (user_id) DO NOTHING;

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;
