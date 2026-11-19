-- Prevent stale HTTP status from inflating the admin online counter. No automatic offline transitions.
-- Preserve the admin-only role check and unrelated KPIs.
CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  day_start timestamptz;
  day_end timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Calendar day for the Stream Monitor Brazilian business dashboard.
  day_start := date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza';
  day_end := (date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') + interval '1 day') AT TIME ZONE 'America/Fortaleza';

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'new_users_7d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    -- Every new profile recorded today, regardless of attribution source.
    'signups_today', (SELECT COUNT(*) FROM public.profiles WHERE created_at >= day_start AND created_at < day_end),
    -- People whose FIRST approved monthly/quarterly/yearly subscription payment
    -- was made today. Renewals, credit packs and store purchases do not count.
    'new_paid_today', (
      SELECT COUNT(DISTINCT p.user_id)
      FROM public.payments p
      WHERE p.status = 'approved'
        AND p.payment_type = 'subscription'
        AND p.plan IN ('monthly', 'quarterly', 'yearly')
        AND p.paid_at >= day_start AND p.paid_at < day_end
        AND NOT EXISTS (
          SELECT 1 FROM public.payments old
          WHERE old.user_id = p.user_id
            AND old.status = 'approved'
            AND old.payment_type = 'subscription'
            AND old.plan IN ('monthly', 'quarterly', 'yearly')
            AND old.paid_at < day_start
        )
    ),
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
    'servers_paused', (SELECT COUNT(*) FROM public.servers WHERE monitoring_paused IS TRUE AND (paused_reason IS NULL OR paused_reason != 'subscription_expired')),
    'servers_online', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'up' AND last_checked_at >= now()-interval '15 minutes'),
    'servers_warning', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status IN ('degraded','unknown') AND last_checked_at >= now()-interval '15 minutes'),
    'servers_offline', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'down' AND last_checked_at >= now()-interval '15 minutes'),
    'servers_unverified', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND (last_checked_at < now()-interval '15 minutes' OR last_checked_at IS NULL)),
    'paused_owners', (SELECT COUNT(*) FROM public.servers WHERE monitoring_paused IS TRUE AND paused_reason = 'subscription_expired'),
    'total_referrals', (SELECT COUNT(*) FROM public.referrals),
    'converted_referrals', (SELECT COUNT(*) FROM public.referrals WHERE reward_granted_at IS NOT NULL)
  ) INTO result;

  RETURN result;
END;
$function$;
