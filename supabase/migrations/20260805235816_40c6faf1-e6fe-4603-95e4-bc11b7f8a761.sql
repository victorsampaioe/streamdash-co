-- 1) Novo plano trimestral
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'quarterly';

-- 2) Mantém profiles.credits espelhando a carteira (fonte de verdade)
CREATE OR REPLACE FUNCTION public.sync_profile_credits_from_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = NEW.credits
  WHERE id = NEW.reseller_id
    AND COALESCE(credits, 0) <> NEW.credits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_credits ON public.reseller_wallet;
CREATE TRIGGER trg_sync_profile_credits
AFTER INSERT OR UPDATE OF credits ON public.reseller_wallet
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_credits_from_wallet();

-- 3) Pagamento aprovado: créditos vão para a carteira; assinatura ganha trimestral
CREATE OR REPLACE FUNCTION public.finalize_approved_payment(
  _payment_id uuid,
  _provider_payment_id text,
  _raw_payload jsonb,
  _paid_at timestamp with time zone DEFAULT now()
)
RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

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

    SELECT s.expires_at INTO v_expires
    FROM public.subscriptions s
    WHERE s.user_id = pay.user_id;

    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  ELSE
    duration := CASE pay.plan::text
      WHEN 'yearly' THEN interval '365 days'
      WHEN 'quarterly' THEN interval '92 days'
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