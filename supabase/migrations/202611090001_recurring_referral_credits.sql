-- Indique e Ganhe · 30% recorrente por assinatura paga
-- Idempotent migration: provisioned directly in Lovable Cloud and tracked in Git.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gross_amount_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS referral_discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_referral_discount_bounds;
ALTER TABLE public.payments ADD CONSTRAINT payments_referral_discount_bounds CHECK (
 referral_discount_cents >= 0 AND
 (gross_amount_cents IS NULL OR (gross_amount_cents >= referral_discount_cents AND
 amount_cents = gross_amount_cents - referral_discount_cents))
);
CREATE TABLE IF NOT EXISTS public.referral_commissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source_payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE CASCADE,
 paid_amount_cents integer NOT NULL CHECK(paid_amount_cents>0),
 rate_bps integer NOT NULL DEFAULT 3000 CHECK(rate_bps=3000),
 amount_cents integer NOT NULL CHECK(amount_cents>0),
 reversed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(referrer_id<>referred_id)
);
CREATE INDEX IF NOT EXISTS referral_commissions_owner_created_idx ON public.referral_commissions(referrer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.referral_credit_redemptions (
 payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 amount_cents integer NOT NULL CHECK(amount_cents>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_credit_redemptions_owner_idx ON public.referral_credit_redemptions(owner_id);
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_credit_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_commissions_own_read ON public.referral_commissions;
CREATE POLICY referral_commissions_own_read ON public.referral_commissions
 FOR SELECT TO authenticated USING (referrer_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS referral_redemptions_own_read ON public.referral_credit_redemptions;
CREATE POLICY referral_redemptions_own_read ON public.referral_credit_redemptions
 FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
REVOKE INSERT,UPDATE,DELETE ON public.referral_commissions FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.referral_credit_redemptions FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS on_payment_paid_grant_referral ON public.payments;
DROP TRIGGER IF EXISTS trg_grant_referral_reward ON public.payments;

CREATE OR REPLACE FUNCTION public.award_recurring_referral_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_referrer uuid; v_amount integer;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status='refunded' THEN
   UPDATE public.referral_commissions SET reversed_at=now()
   WHERE source_payment_id=NEW.id AND reversed_at IS NULL;
   RETURN NEW;
 END IF;
 IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status='approved' THEN RETURN NEW; END IF;
 IF NEW.provider <> 'mercadopago' OR NEW.payment_type <> 'subscription'
    OR NEW.plan::text NOT IN ('monthly','quarterly','yearly')
    OR NEW.amount_cents<=0 OR NEW.provider_payment_id IS NULL THEN RETURN NEW; END IF;
 SELECT r.referrer_id INTO v_referrer FROM public.referrals r
 WHERE r.referred_id=NEW.user_id AND r.referrer_id <> NEW.user_id
 ORDER BY r.created_at LIMIT 1;
 IF v_referrer IS NULL THEN RETURN NEW; END IF;
 v_amount:=round(NEW.amount_cents::numeric*0.30)::integer;
 IF v_amount<=0 THEN RETURN NEW; END IF;
 INSERT INTO public.referral_commissions(referrer_id,referred_id,source_payment_id,paid_amount_cents,amount_cents)
 VALUES(v_referrer,NEW.user_id,NEW.id,NEW.amount_cents,v_amount)
 ON CONFLICT(source_payment_id) DO NOTHING;
 -- Compatibilidade com a lista antiga; dinheiro somente no ledger.
 UPDATE public.referrals
 SET status='subscribed',subscribed_at=coalesce(subscribed_at,now()),
     converted_at=coalesce(converted_at,now())
 WHERE referred_id=NEW.user_id AND status IN ('pending','trial_active');
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_referral_credit_payment(_payment_id uuid)
 RETURNS TABLE(applied boolean, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 p public.payments%ROWTYPE;
 v_expires timestamptz;
 v_duration interval;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=_payment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança inexistente'; END IF;
 IF p.status='approved' AND p.provider='referral_credit' THEN
   SELECT s.expires_at INTO v_expires FROM public.subscriptions s WHERE s.user_id=p.user_id;
   RETURN QUERY SELECT false,v_expires; RETURN;
 END IF;
 IF p.status <> 'pending' OR p.payment_type <> 'subscription'
    OR p.provider <> 'mercadopago' OR p.provider_payment_id IS NOT NULL
    OR p.gross_amount_cents IS NULL OR p.gross_amount_cents<=0
    OR p.referral_discount_cents <> p.gross_amount_cents OR p.amount_cents <> 0
    OR p.plan::text NOT IN ('monthly','quarterly','yearly')
    OR NOT EXISTS (
      SELECT 1 FROM public.referral_credit_redemptions r
      WHERE r.payment_id=p.id AND r.owner_id=p.user_id AND r.amount_cents=p.gross_amount_cents
    ) THEN
    RAISE EXCEPTION 'Saldo de indicação insuficiente ou cobrança inválida';
 END IF;
 v_duration := CASE p.plan::text WHEN 'yearly' THEN interval '1 year'
                                WHEN 'quarterly' THEN interval '3 months'
                                ELSE interval '1 month' END;
 INSERT INTO public.subscriptions(user_id,plan,status,started_at,expires_at)
 VALUES(p.user_id,p.plan,'active',now(),now()+v_duration)
 ON CONFLICT(user_id) DO UPDATE SET
   plan=EXCLUDED.plan,status='active',
   expires_at=greatest(public.subscriptions.expires_at,now())+v_duration,
   updated_at=now()
 RETURNING public.subscriptions.expires_at INTO v_expires;
 UPDATE public.payments SET status='approved',provider='referral_credit',
   paid_at=now(),
   raw_payload=jsonb_build_object('source','referral_credit','gross_cents',p.gross_amount_cents,'discount_cents',p.referral_discount_cents)
 WHERE id=p.id;
 RETURN QUERY SELECT true,v_expires;
END;
$function$;

CREATE OR REPLACE FUNCTION public.referral_wallet_balance(_owner uuid)
 RETURNS TABLE(earned_cents bigint, used_cents bigint, reserved_cents bigint, available_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH earnings AS (
  SELECT COALESCE(sum(amount_cents),0)::bigint AS n
  FROM public.referral_commissions WHERE referrer_id=_owner AND reversed_at IS NULL
 ), uses AS (
  SELECT
    COALESCE(sum(r.amount_cents) FILTER(WHERE p.status='approved'),0)::bigint AS spent,
    COALESCE(sum(r.amount_cents) FILTER(WHERE p.status='pending' AND p.expires_at > now()),0)::bigint AS held
  FROM public.referral_credit_redemptions r
  JOIN public.payments p ON p.id=r.payment_id
  WHERE r.owner_id=_owner
 )
 SELECT earnings.n,uses.spent,uses.held,
        greatest(0::bigint,earnings.n-uses.spent-uses.held)
 FROM earnings CROSS JOIN uses;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_referral_discount(_payment_id uuid)
 RETURNS TABLE(discount_cents integer, amount_to_pay_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  p public.payments%ROWTYPE;
  v_available bigint;
  v_discount integer;
  v_reserved integer;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id=_payment_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'pending' OR p.payment_type <> 'subscription'
     OR p.provider <> 'mercadopago'
     OR p.plan::text NOT IN ('monthly','quarterly','yearly')
     OR p.gross_amount_cents IS NULL OR p.gross_amount_cents <= 0
     OR p.provider_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pagamento de assinatura inválido para desconto';
  END IF;
  -- Trava por cliente: duas cobranças paralelas não gastam o mesmo saldo.
  PERFORM 1 FROM public.profiles WHERE id=p.user_id FOR UPDATE;
  SELECT amount_cents INTO v_reserved FROM public.referral_credit_redemptions WHERE payment_id=p.id;
  IF FOUND THEN
    RETURN QUERY SELECT v_reserved,p.amount_cents;
    RETURN;
  END IF;
  SELECT b.available_cents INTO v_available FROM public.referral_wallet_balance(p.user_id) b;
  v_discount := least(p.gross_amount_cents, greatest(0,coalesce(v_available,0)))::integer;
  IF v_discount > 0 THEN
    INSERT INTO public.referral_credit_redemptions(payment_id,owner_id,amount_cents)
    VALUES (p.id,p.user_id,v_discount);
  END IF;
  UPDATE public.payments
  SET amount_cents = p.gross_amount_cents-v_discount,
      referral_discount_cents=v_discount
  WHERE id=p.id;
  RETURN QUERY SELECT v_discount,p.gross_amount_cents-v_discount;
END;
$function$;


DROP TRIGGER IF EXISTS on_payment_recurring_referral ON public.payments;
CREATE TRIGGER on_payment_recurring_referral
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.award_recurring_referral_commission();
REVOKE ALL ON FUNCTION public.referral_wallet_balance(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_referral_discount(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_referral_credit_payment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.referral_wallet_balance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_referral_discount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_referral_credit_payment(uuid) TO service_role;
