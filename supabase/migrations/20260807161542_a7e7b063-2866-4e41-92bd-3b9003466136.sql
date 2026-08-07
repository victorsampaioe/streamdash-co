CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'servers_paused', (SELECT COUNT(*) FROM public.servers WHERE monitoring_paused IS TRUE),
    'servers_online', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'up'),
    'servers_warning', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status IN ('degraded','unknown')),
    'servers_offline', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'down'),
    'paused_owners', (SELECT COUNT(DISTINCT owner_id) FROM public.servers WHERE monitoring_paused IS TRUE),
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
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_paused_owners()
 RETURNS TABLE (
   owner_id uuid,
   full_name text,
   email text,
   account_type text,
   credits integer,
   subscription_status text,
   expires_at timestamptz,
   paused_reason text,
   paused_servers integer,
   total_servers integer,
   last_paused_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    CASE
      WHEN public.has_role(p.id, 'admin') THEN 'admin'
      WHEN public.has_role(p.id, 'sub_reseller') THEN 'sub_reseller'
      WHEN public.has_role(p.id, 'reseller') OR COALESCE(p.is_reseller,false) THEN 'reseller'
      ELSE 'client'
    END::text,
    GREATEST(COALESCE(p.credits,0), COALESCE(w.credits,0))::int,
    s.status::text,
    s.expires_at,
    MIN(sv.paused_reason)::text,
    COUNT(*) FILTER (WHERE sv.monitoring_paused IS TRUE)::int,
    (SELECT COUNT(*) FROM public.servers x WHERE x.owner_id = p.id)::int,
    MAX(sv.paused_at)
  FROM public.servers sv
  JOIN public.profiles p ON p.id = sv.owner_id
  LEFT JOIN public.reseller_wallet w ON w.reseller_id = p.id
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  WHERE sv.monitoring_paused IS TRUE
  GROUP BY p.id, p.full_name, p.email, p.is_reseller, p.credits, w.credits, s.status, s.expires_at
  ORDER BY COUNT(*) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_paused_owners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_paused_owners() TO authenticated;