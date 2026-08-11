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
  -- We cast plan to text for comparison and then back to plan_type for insert
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan::public.plan_type, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

  -- Logic for credits
  IF pay.plan::text LIKE 'credits_%' THEN
    v_credits_to_add := CASE pay.plan::text
      WHEN 'credits_10' THEN 10
      WHEN 'credits_30' THEN 30
      WHEN 'credits_40' THEN 40
      WHEN 'credits_50' THEN 50
      ELSE 0
    END;

    IF v_credits_to_add > 0 THEN
      INSERT INTO public.reseller_wallet (reseller_id, credits)
      VALUES (pay.user_id, v_credits_to_add)
      ON CONFLICT (reseller_id) DO UPDATE
        SET credits = public.reseller_wallet.credits + v_credits_to_add,
            updated_at = now();

      UPDATE public.profiles SET is_reseller = true WHERE id = pay.user_id;

      INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
      VALUES (pay.user_id, v_credits_to_add, 'purchase',
              'Compra de pacote de créditos via PIX (' || v_credits_to_add || ' unidades)');
    END IF;
    
    RETURN QUERY SELECT true, pay.user_id, 'monthly'::public.plan_type, null::timestamptz;
    RETURN;
  END IF;

  -- Logic for subscriptions
  duration := CASE pay.plan::text
    WHEN 'yearly' THEN interval '1 year'
    WHEN 'quarterly' THEN interval '3 months'
    ELSE interval '1 month'
  END;

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (pay.user_id, pay.plan::public.plan_type, 'active', now(), now() + duration)
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      status = 'active',
      expires_at = CASE
        WHEN public.subscriptions.expires_at > now() THEN public.subscriptions.expires_at + duration
        ELSE now() + duration
      END,
      updated_at = now()
  RETURNING user_id, plan, expires_at INTO v_user_id, v_plan, v_expires;

  RETURN QUERY SELECT true, v_user_id, v_plan, v_expires;
END;
$function$;
