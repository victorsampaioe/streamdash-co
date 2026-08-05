CREATE OR REPLACE FUNCTION public.finalize_approved_payment(_payment_id uuid, _provider_payment_id text, _raw_payload jsonb, _paid_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
  v_credits_to_add int := 0;
BEGIN
  -- 1. Lock and update payment status
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  -- 2. If already approved or not found, just return current state
  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

  -- 3. Determine if this is a Credit Purchase or a Subscription Renewal
  IF pay.plan::text LIKE 'credits_%' THEN
    -- CREDIT PURCHASE FLOW
    v_credits_to_add := CASE pay.plan::text
      WHEN 'credits_10' THEN 10
      WHEN 'credits_30' THEN 30
      WHEN 'credits_40' THEN 40
      ELSE 0
    END;

    IF v_credits_to_add > 0 THEN
      -- Add credits to profile
      UPDATE public.profiles
      SET credits = COALESCE(credits, 0) + v_credits_to_add
      WHERE id = pay.user_id;

      -- Log history
      INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
      VALUES (pay.user_id, v_credits_to_add, 'purchase', 'Compra de pacote de créditos via PIX (' || v_credits_to_add || ' unidades)');
    END IF;

    -- For credits, we don't change the subscription. Just return current expiry.
    SELECT s.expires_at INTO v_expires 
    FROM public.subscriptions s 
    WHERE s.user_id = pay.user_id;
    
    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  ELSE
    -- SUBSCRIPTION RENEWAL FLOW
    duration := CASE pay.plan
      WHEN 'yearly'::public.plan_type THEN interval '365 days'
      ELSE interval '31 days'
    END;

    UPDATE public.subscriptions s
    SET plan = pay.plan,
        status = 'active'::public.subscription_status,
        expires_at = GREATEST(COALESCE(s.expires_at, _paid_at), _paid_at) + duration,
        cancelled_at = null
    WHERE s.user_id = pay.user_id
    RETURNING s.expires_at INTO v_expires;

    IF NOT FOUND THEN
      INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
      VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration)
      RETURNING public.subscriptions.expires_at INTO v_expires;
    END IF;

    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  END IF;
END;
$function$;