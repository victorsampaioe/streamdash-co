ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS api_plan_id uuid REFERENCES public.api_plans(id) ON DELETE RESTRICT;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('subscription', 'store', 'api_subscription'));

CREATE INDEX IF NOT EXISTS payments_api_plan_idx
  ON public.payments(api_plan_id, status, created_at DESC)
  WHERE api_plan_id IS NOT NULL;

ALTER TABLE public.api_subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

UPDATE public.api_plans
SET monthly_price_cents = CASE code
      WHEN 'api_pro' THEN 4990
      WHEN 'api_business' THEN 9990
      WHEN 'api_ai' THEN 14990
      WHEN 'enterprise' THEN 24990
      ELSE monthly_price_cents
    END,
    is_active = CASE WHEN code IN ('api_pro','api_business','api_ai','enterprise') THEN true ELSE is_active END,
    is_public = CASE WHEN code IN ('api_pro','api_business','api_ai','enterprise') THEN true ELSE is_public END,
    updated_at = now()
WHERE code IN ('api_pro','api_business','api_ai','enterprise');

CREATE OR REPLACE FUNCTION public.stream_monitor_account_active(_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_account_id, 'admin'::public.app_role)
    OR (
      (
        public.has_role(_account_id, 'reseller'::public.app_role)
        OR public.has_role(_account_id, 'sub_reseller'::public.app_role)
        OR COALESCE((SELECT p.is_reseller FROM public.profiles p WHERE p.id = _account_id), false)
      )
      AND GREATEST(
        COALESCE((SELECT p.credits FROM public.profiles p WHERE p.id = _account_id), 0),
        COALESCE((SELECT rw.credits FROM public.reseller_wallet rw WHERE rw.reseller_id = _account_id), 0)
      ) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _account_id
        AND s.status IN ('active'::public.subscription_status, 'trial'::public.subscription_status)
        AND s.expires_at > now()
    );
$$;
REVOKE ALL ON FUNCTION public.stream_monitor_account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stream_monitor_account_active(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_api_subscription_entitlement(_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  main_active boolean;
BEGIN
  main_active := public.stream_monitor_account_active(_account_id);

  UPDATE public.api_subscriptions
  SET status = 'expired',
      suspended_reason = NULL,
      suspended_at = NULL,
      updated_at = now()
  WHERE account_id = _account_id
    AND expires_at IS NOT NULL
    AND expires_at <= now()
    AND status IN ('active', 'trial', 'suspended', 'past_due');

  IF main_active THEN
    UPDATE public.api_subscriptions
    SET status = 'active',
        suspended_reason = NULL,
        suspended_at = NULL,
        updated_at = now()
    WHERE account_id = _account_id
      AND status = 'suspended'
      AND suspended_reason = 'main_subscription_inactive'
      AND (expires_at IS NULL OR expires_at > now());
  ELSE
    UPDATE public.api_subscriptions
    SET status = 'suspended',
        suspended_reason = 'main_subscription_inactive',
        suspended_at = COALESCE(suspended_at, now()),
        updated_at = now()
    WHERE account_id = _account_id
      AND status IN ('active', 'trial')
      AND (expires_at IS NULL OR expires_at > now());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_api_subscription_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_api_subscription_entitlement(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_api_entitlement_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  target_id := CASE TG_TABLE_NAME
    WHEN 'subscriptions' THEN NEW.user_id
    WHEN 'reseller_wallet' THEN NEW.reseller_id
    WHEN 'profiles' THEN NEW.id
    ELSE NULL
  END;
  IF target_id IS NOT NULL THEN
    PERFORM public.sync_api_subscription_entitlement(target_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_api_entitlement_from_source() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_api_entitlement_from_source() TO service_role;

DROP TRIGGER IF EXISTS subscriptions_sync_api_entitlement ON public.subscriptions;
CREATE TRIGGER subscriptions_sync_api_entitlement
AFTER INSERT OR UPDATE OF status, expires_at ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_api_entitlement_from_source();

DROP TRIGGER IF EXISTS reseller_wallet_sync_api_entitlement ON public.reseller_wallet;
CREATE TRIGGER reseller_wallet_sync_api_entitlement
AFTER INSERT OR UPDATE OF credits ON public.reseller_wallet
FOR EACH ROW EXECUTE FUNCTION public.sync_api_entitlement_from_source();

DROP TRIGGER IF EXISTS profiles_sync_api_entitlement ON public.profiles;
CREATE TRIGGER profiles_sync_api_entitlement
AFTER UPDATE OF credits, is_reseller ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_api_entitlement_from_source();

CREATE OR REPLACE FUNCTION public.finalize_approved_payment(
  _payment_id uuid,
  _provider_payment_id text,
  _raw_payload jsonb,
  _paid_at timestamp with time zone DEFAULT now()
)
RETURNS TABLE(applied boolean, user_id uuid, plan public.plan_type, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
  v_credits_to_add int := 0;
  v_api_price integer;
  v_api_status text;
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
    SELECT p.user_id,
           CASE WHEN p.payment_type = 'api_subscription' THEN 'monthly'::public.plan_type ELSE p.plan::public.plan_type END,
           CASE WHEN p.payment_type = 'api_subscription' THEN a.expires_at ELSE s.expires_at END
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    LEFT JOIN public.api_subscriptions a ON a.account_id = p.user_id AND a.environment = 'live'
    WHERE p.id = _payment_id;
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

  IF pay.payment_type = 'api_subscription' THEN
    IF pay.api_plan_id IS NULL THEN
      RAISE EXCEPTION 'api plan is required';
    END IF;

    SELECT monthly_price_cents INTO v_api_price
    FROM public.api_plans
    WHERE id = pay.api_plan_id AND is_active = true;

    IF v_api_price IS NULL OR pay.amount_cents <> v_api_price THEN
      RAISE EXCEPTION 'invalid api plan price';
    END IF;

    v_api_status := CASE
      WHEN public.stream_monitor_account_active(pay.user_id) THEN 'active'
      ELSE 'suspended'
    END;

    INSERT INTO public.api_subscriptions (
      account_id, plan_id, status, environment, starts_at, expires_at,
      last_payment_id, suspended_reason, suspended_at, metadata
    )
    VALUES (
      pay.user_id, pay.api_plan_id, v_api_status, 'live', now(), now() + interval '1 month',
      pay.id,
      CASE WHEN v_api_status = 'suspended' THEN 'main_subscription_inactive' ELSE NULL END,
      CASE WHEN v_api_status = 'suspended' THEN now() ELSE NULL END,
      jsonb_build_object('source', 'mercadopago_pix')
    )
    ON CONFLICT (account_id, environment) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        starts_at = COALESCE(public.api_subscriptions.starts_at, EXCLUDED.starts_at),
        expires_at = CASE
          WHEN public.api_subscriptions.expires_at > now() THEN public.api_subscriptions.expires_at + interval '1 month'
          ELSE now() + interval '1 month'
        END,
        last_payment_id = pay.id,
        suspended_reason = EXCLUDED.suspended_reason,
        suspended_at = EXCLUDED.suspended_at,
        metadata = public.api_subscriptions.metadata || EXCLUDED.metadata,
        updated_at = now()
    RETURNING account_id, expires_at INTO v_user_id, v_expires;

    RETURN QUERY SELECT true, v_user_id, 'monthly'::public.plan_type, v_expires;
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

    RETURN QUERY SELECT true, pay.user_id, 'monthly'::public.plan_type, null::timestamptz;
    RETURN;
  END IF;

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
$$;
REVOKE ALL ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) TO service_role;