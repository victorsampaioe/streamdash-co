-- Fix: enum uses 'approved', not 'paid'
CREATE OR REPLACE FUNCTION public.grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ref record;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT * INTO ref FROM public.referrals
    WHERE referred_id = NEW.user_id AND reward_granted_at IS NULL
    LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.subscriptions
    SET expires_at = GREATEST(expires_at, now()) + interval '30 days',
        status = CASE WHEN status IN ('expired','cancelled') THEN 'active' ELSE status END
    WHERE user_id = ref.referrer_id;

  UPDATE public.referrals
    SET converted_at = COALESCE(converted_at, now()),
        reward_granted_at = now()
    WHERE id = ref.id;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on payments
DROP TRIGGER IF EXISTS trg_grant_referral_reward ON public.payments;
CREATE TRIGGER trg_grant_referral_reward
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.grant_referral_reward();

-- Admin aggregated stats (safe, no PII)
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'new_users_7d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    'trial_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'trial' AND expires_at > now()),
    'paid_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active' AND expires_at > now()),
    'expired', (SELECT COUNT(*) FROM public.subscriptions WHERE expires_at <= now()),
    'cancelled', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'cancelled'),
    'expiring_7d', (SELECT COUNT(*) FROM public.subscriptions WHERE expires_at > now() AND expires_at < now() + interval '7 days'),
    'monthly_subs', (SELECT COUNT(*) FROM public.subscriptions WHERE plan = 'monthly' AND expires_at > now()),
    'yearly_subs', (SELECT COUNT(*) FROM public.subscriptions WHERE plan = 'yearly' AND expires_at > now()),
    'payments_pending', (SELECT COUNT(*) FROM public.payments WHERE status = 'pending'),
    'payments_approved_total', (SELECT COUNT(*) FROM public.payments WHERE status = 'approved'),
    'revenue_cents_total', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved'),
    'revenue_cents_30d', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved' AND paid_at > now() - interval '30 days'),
    'revenue_cents_7d', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved' AND paid_at > now() - interval '7 days'),
    'total_servers', (SELECT COUNT(*) FROM public.servers),
    'total_referrals', (SELECT COUNT(*) FROM public.referrals),
    'converted_referrals', (SELECT COUNT(*) FROM public.referrals WHERE reward_granted_at IS NOT NULL),
    'signups_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', c) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS c
        FROM public.profiles
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Admin user list with joined subscription state
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  is_admin boolean,
  plan plan_type,
  status subscription_status,
  expires_at timestamptz,
  days_remaining int,
  total_paid_cents bigint,
  last_payment_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.created_at,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin') AS is_admin,
    s.plan,
    s.status,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::int) AS days_remaining,
    COALESCE((SELECT SUM(amount_cents) FROM public.payments WHERE user_id = p.id AND status = 'approved'), 0)::bigint AS total_paid_cents,
    (SELECT MAX(paid_at) FROM public.payments WHERE user_id = p.id AND status = 'approved') AS last_payment_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;