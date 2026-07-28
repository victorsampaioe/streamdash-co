
-- 1) server_analysis
CREATE TABLE public.server_analysis (
  server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  is_cloudflare boolean,
  cdn_provider text,
  ipv4 text[],
  ipv6 text[],
  nameservers text[],
  ttl_seconds integer,
  ssl_issuer text,
  ssl_expires_at timestamptz,
  ssl_algorithm text,
  country text,
  city text,
  asn text,
  org text,
  response_ms integer,
  cert_history jsonb,
  raw jsonb,
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.server_analysis TO authenticated;
GRANT ALL ON public.server_analysis TO service_role;
ALTER TABLE public.server_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analysis: owner or admin reads" ON public.server_analysis
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "analysis: owner writes" ON public.server_analysis
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

-- 2) achievements catalog
CREATE TABLE public.achievements (
  code text PRIMARY KEY,
  emoji text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements: public read" ON public.achievements FOR SELECT USING (true);

INSERT INTO public.achievements (code, emoji, title, description) VALUES
  ('no_incidents_30d', '🏆', '30 dias sem incidentes', 'Um servidor seu ficou 30 dias sem nenhum incidente registrado.'),
  ('monitoring_100d', '🥇', '100 dias monitorando', 'Você monitora um servidor há 100 dias ou mais.'),
  ('low_latency', '⚡', 'Baixa latência', 'Um servidor seu manteve latência média abaixo de 100 ms nas últimas 24h.'),
  ('ssl_always_valid', '🛡', 'SSL sempre válido', 'Um servidor seu manteve SSL válido nos últimos 60 dias.');

-- 3) user_achievements
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_code text NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_code, server_id)
);
GRANT SELECT ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ua: user reads own" ON public.user_achievements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ua: admin reads all" ON public.user_achievements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4) evaluate_achievements function
CREATE OR REPLACE FUNCTION public.evaluate_achievements(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  granted int := 0;
  s record;
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid() THEN
    -- allow admins too
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  FOR s IN SELECT id, created_at, ssl_days_remaining FROM public.servers WHERE owner_id = _user_id LOOP
    -- 30 dias sem incidentes
    IF s.created_at < now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.incidents i
         WHERE i.server_id = s.id AND i.started_at > now() - interval '30 days'
       )
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'no_incidents_30d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    -- 100 dias monitorando
    IF s.created_at < now() - interval '100 days' THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'monitoring_100d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    -- Baixa latência
    IF (SELECT AVG(latency_ms) FROM public.checks
        WHERE server_id = s.id AND checked_at > now() - interval '24 hours' AND latency_ms IS NOT NULL) < 100
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'low_latency', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    -- SSL sempre válido últimos 60 dias
    IF s.created_at < now() - interval '60 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.checks c
         WHERE c.server_id = s.id
           AND c.checked_at > now() - interval '60 days'
           AND c.ssl_days_remaining IS NOT NULL
           AND c.ssl_days_remaining <= 0
       )
       AND s.ssl_days_remaining IS NOT NULL AND s.ssl_days_remaining > 0
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'ssl_always_valid', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;
  END LOOP;

  RETURN granted;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;

-- 5) public DNS list
CREATE OR REPLACE FUNCTION public.get_public_dns_list()
RETURNS TABLE(name text, current_status server_status, last_checked_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, current_status, last_checked_at
  FROM public.servers
  WHERE is_public = true
  ORDER BY name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_dns_list() TO anon, authenticated;

-- 6) trial padrão de 2 dias
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
  trial_days int := 2;
  my_code text;
BEGIN
  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT id, signup_bonus_days INTO referrer, bonus
      FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
    IF referrer IS NOT NULL AND referrer <> new.id THEN
      trial_days := 2 + COALESCE(bonus, 2);
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
