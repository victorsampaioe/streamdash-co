
-- 1. Alter referrals table
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS reward_cents integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_request_id uuid;

-- Backfill status based on existing data
UPDATE public.referrals SET status = 'subscribed', subscribed_at = COALESCE(reward_granted_at, converted_at, created_at)
  WHERE reward_granted_at IS NOT NULL AND status = 'pending';
UPDATE public.referrals SET status = 'trial_active' WHERE converted_at IS NULL AND reward_granted_at IS NULL AND status = 'pending';

-- 2. Adjust default signup bonus days from 10 to 2
ALTER TABLE public.profiles ALTER COLUMN signup_bonus_days SET DEFAULT 2;
UPDATE public.profiles SET signup_bonus_days = 2 WHERE signup_bonus_days = 10;

-- 3. Create payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  pix_type text NOT NULL CHECK (pix_type IN ('cpf','phone','email','random')),
  pix_key text NOT NULL,
  pix_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','paid','rejected')),
  admin_note text,
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout: user reads own" ON public.payout_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "payout: user inserts own" ON public.payout_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "payout: admin reads all" ON public.payout_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "payout: admin updates" ON public.payout_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER payout_requests_touch BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- FK from referrals to payout_requests
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_payout_request_fk FOREIGN KEY (payout_request_id) REFERENCES public.payout_requests(id) ON DELETE SET NULL;

-- 4. Replace grant_referral_reward: mark referral as subscribed, do NOT extend indicator's plan
CREATE OR REPLACE FUNCTION public.grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref record;
  is_first_payment boolean;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT * INTO ref FROM public.referrals
    WHERE referred_id = NEW.user_id AND status IN ('pending','trial_active')
    LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Only the FIRST approved payment triggers reward
  SELECT NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE user_id = NEW.user_id AND status = 'approved' AND id <> NEW.id
  ) INTO is_first_payment;
  IF NOT is_first_payment THEN RETURN NEW; END IF;

  UPDATE public.referrals
    SET status = 'subscribed',
        subscribed_at = now(),
        converted_at = COALESCE(converted_at, now()),
        reward_granted_at = now(),
        reward_cents = COALESCE(reward_cents, 1000)
    WHERE id = ref.id;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_grant_referral_reward ON public.payments;
CREATE TRIGGER trg_grant_referral_reward
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.grant_referral_reward();

-- 5. RPC: referral balance summary for a user
CREATE OR REPLACE FUNCTION public.get_referral_summary(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'total_referrals', COUNT(*),
    'in_trial', COUNT(*) FILTER (WHERE status IN ('pending','trial_active')),
    'subscribed_count', COUNT(*) FILTER (WHERE status IN ('subscribed','requested','approved','paid')),
    'available_cents', COALESCE(SUM(reward_cents) FILTER (WHERE status = 'subscribed'), 0),
    'pending_cents', COALESCE(SUM(reward_cents) FILTER (WHERE status IN ('requested','approved')), 0),
    'paid_cents', COALESCE(SUM(reward_cents) FILTER (WHERE status = 'paid'), 0)
  ) INTO result
  FROM public.referrals WHERE referrer_id = _user_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_summary(uuid) TO authenticated;

-- 6. RPC: create payout request
CREATE OR REPLACE FUNCTION public.request_payout(_pix_type text, _pix_key text, _pix_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total_cents integer;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _pix_type NOT IN ('cpf','phone','email','random') THEN RAISE EXCEPTION 'invalid pix type'; END IF;
  IF length(trim(_pix_key)) < 3 THEN RAISE EXCEPTION 'invalid pix key'; END IF;
  IF length(trim(_pix_name)) < 2 THEN RAISE EXCEPTION 'invalid pix name'; END IF;

  SELECT COALESCE(SUM(reward_cents),0) INTO total_cents
    FROM public.referrals WHERE referrer_id = uid AND status = 'subscribed';
  IF total_cents < 1000 THEN RAISE EXCEPTION 'saldo insuficiente'; END IF;

  INSERT INTO public.payout_requests (user_id, amount_cents, pix_type, pix_key, pix_name)
  VALUES (uid, total_cents, _pix_type, trim(_pix_key), trim(_pix_name))
  RETURNING id INTO new_id;

  UPDATE public.referrals
    SET status = 'requested', requested_at = now(), payout_request_id = new_id
    WHERE referrer_id = uid AND status = 'subscribed';

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(text,text,text) TO authenticated;

-- 7. Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_approve_payout(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payout_requests SET status = 'approved', approved_at = now(), approved_by = auth.uid()
    WHERE id = _id AND status = 'requested';
  UPDATE public.referrals SET status = 'approved', approved_at = now()
    WHERE payout_request_id = _id AND status = 'requested';
END; $$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payout_requests SET status = 'paid', paid_at = now()
    WHERE id = _id AND status IN ('approved','requested');
  UPDATE public.referrals SET status = 'paid', paid_at = now()
    WHERE payout_request_id = _id AND status IN ('requested','approved');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reject_payout(_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payout_requests SET status = 'rejected', rejected_at = now(), admin_note = _note, approved_by = auth.uid()
    WHERE id = _id AND status IN ('requested','approved');
  -- Release referrals back to 'subscribed' so user can re-request
  UPDATE public.referrals SET status = 'subscribed', requested_at = NULL, approved_at = NULL, payout_request_id = NULL
    WHERE payout_request_id = _id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_approve_payout(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_payout(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid,text) TO authenticated;

-- 8. Admin list of payout requests with user info
CREATE OR REPLACE FUNCTION public.admin_list_payout_requests()
RETURNS TABLE(
  id uuid, user_id uuid, user_email text, user_name text, user_phone text,
  amount_cents integer, pix_type text, pix_key text, pix_name text,
  status text, admin_note text, requested_at timestamptz, approved_at timestamptz,
  paid_at timestamptz, rejected_at timestamptz,
  referral_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT pr.id, pr.user_id, p.email, p.full_name, p.phone,
         pr.amount_cents, pr.pix_type, pr.pix_key, pr.pix_name,
         pr.status, pr.admin_note, pr.requested_at, pr.approved_at,
         pr.paid_at, pr.rejected_at,
         (SELECT COUNT(*) FROM public.referrals r WHERE r.payout_request_id = pr.id)
  FROM public.payout_requests pr
  LEFT JOIN public.profiles p ON p.id = pr.user_id
  ORDER BY pr.requested_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.admin_list_payout_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;
