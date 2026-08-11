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
    -- DNS Pausados: Apenas os que foram pausados manualmente (não por expiração) ou motivo genérico
    'servers_paused', (SELECT COUNT(*) FROM public.servers WHERE monitoring_paused IS TRUE AND (paused_reason IS NULL OR paused_reason != 'subscription_expired')),
    'servers_online', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'up'),
    'servers_warning', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status IN ('degraded','unknown')),
    'servers_offline', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'down'),
    -- Contas expiradas: Contagem de servidores afetados por falta de créditos/assinatura
    'paused_owners', (SELECT COUNT(*) FROM public.servers WHERE monitoring_paused IS TRUE AND paused_reason = 'subscription_expired'),
    'total_referrals', (SELECT COUNT(*) FROM public.referrals),
    'converted_referrals', (SELECT COUNT(*) FROM public.referrals WHERE reward_granted_at IS NOT NULL)
  ) INTO result;

  RETURN result;
END;
$function$;
