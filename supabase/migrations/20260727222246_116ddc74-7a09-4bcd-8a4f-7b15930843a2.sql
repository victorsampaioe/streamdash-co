CREATE OR REPLACE FUNCTION public.finalize_approved_payment(
  _payment_id uuid,
  _provider_payment_id text,
  _raw_payload jsonb,
  _paid_at timestamptz DEFAULT now()
)
RETURNS TABLE(applied boolean, user_id uuid, plan public.plan_type, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  new_expires timestamptz;
  duration interval;
BEGIN
  UPDATE public.payments
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE id = _payment_id
    AND status <> 'approved'::public.payment_status
  RETURNING * INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO user_id, plan, expires_at
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    applied := false;
    RETURN NEXT;
    RETURN;
  END IF;

  duration := CASE pay.plan
    WHEN 'yearly'::public.plan_type THEN interval '365 days'
    ELSE interval '30 days'
  END;

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at, cancelled_at)
  VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration, null)
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      status = 'active'::public.subscription_status,
      expires_at = GREATEST(public.subscriptions.expires_at, _paid_at) + duration,
      cancelled_at = null
  RETURNING public.subscriptions.expires_at INTO new_expires;

  applied := true;
  user_id := pay.user_id;
  plan := pay.plan;
  expires_at := new_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) TO service_role;