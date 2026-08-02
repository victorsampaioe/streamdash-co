INSERT INTO public.achievements (code, emoji, title, description)
VALUES ('yearly_subscriber', '👑', 'Assinante Anual', 'Assinou o plano anual do Stream Monitor')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  granted int := 0;
  s record;
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid() THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Assinante anual
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND plan = 'yearly'::public.plan_type
      AND status IN ('active','trial') AND expires_at > now()
  ) THEN
    INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
    VALUES (_user_id, 'yearly_subscriber', NULL)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN granted := granted + 1; END IF;
  END IF;

  FOR s IN SELECT id, created_at, ssl_days_remaining FROM public.servers WHERE owner_id = _user_id LOOP
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

    IF s.created_at < now() - interval '100 days' THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'monitoring_100d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    IF (SELECT AVG(latency_ms) FROM public.checks
        WHERE server_id = s.id AND checked_at > now() - interval '24 hours' AND latency_ms IS NOT NULL) < 100
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'low_latency', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

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
$function$;