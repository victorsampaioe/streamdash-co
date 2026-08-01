CREATE OR REPLACE FUNCTION public.finalize_approved_payment(_payment_id uuid, _provider_payment_id text, _raw_payload jsonb, _paid_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
BEGIN
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    applied := false; user_id := v_user_id; plan := v_plan; expires_at := v_expires;
    RETURN NEXT;
    RETURN;
  END IF;

  duration := CASE pay.plan
    WHEN 'yearly'::public.plan_type THEN interval '365 days'
    ELSE interval '31 days'
  END;

  INSERT INTO public.subscriptions AS s (user_id, plan, status, started_at, expires_at, cancelled_at)
  VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration, null)
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      status = 'active'::public.subscription_status,
      expires_at = GREATEST(s.expires_at, _paid_at) + duration,
      cancelled_at = null
  RETURNING s.expires_at INTO v_expires;

  applied := true;
  user_id := pay.user_id;
  plan := pay.plan;
  expires_at := v_expires;
  RETURN NEXT;
END;
$function$;