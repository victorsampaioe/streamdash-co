CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamp with time zone,
  is_admin boolean,
  plan public.plan_type,
  status public.subscription_status,
  expires_at timestamp with time zone,
  days_remaining integer,
  total_paid_cents bigint,
  last_payment_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role = 'admin'::public.app_role
    ) AS is_admin,
    s.plan,
    s.status,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::int) AS days_remaining,
    COALESCE((
      SELECT SUM(pay.amount_cents)
      FROM public.payments pay
      WHERE pay.user_id = p.id
        AND pay.status = 'approved'::public.payment_status
    ), 0)::bigint AS total_paid_cents,
    (
      SELECT MAX(pay.paid_at)
      FROM public.payments pay
      WHERE pay.user_id = p.id
        AND pay.status = 'approved'::public.payment_status
    ) AS last_payment_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$function$;