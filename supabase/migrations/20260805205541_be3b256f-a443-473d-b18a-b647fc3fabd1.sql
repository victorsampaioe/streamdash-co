CREATE OR REPLACE FUNCTION public.get_admin_users_v2()
RETURNS TABLE(
    id uuid, 
    email text, 
    full_name text, 
    phone text, 
    created_at timestamp with time zone, 
    is_admin boolean, 
    is_reseller boolean,
    credits integer,
    parent_id uuid,
    owner_id uuid,
    plan plan_type, 
    status subscription_status, 
    expires_at timestamp with time zone, 
    days_remaining integer, 
    total_paid_cents bigint, 
    last_payment_at timestamp with time zone
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
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
    ) AS is_admin,
    p.is_reseller,
    COALESCE(w.credits, 0) AS credits,
    t.parent_reseller_id AS parent_id,
    t.owner_id,
    s.plan,
    s.status,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::int) AS days_remaining,
    COALESCE((
      SELECT SUM(pay.amount_cents)
      FROM public.payments pay
      WHERE pay.user_id = p.id AND pay.status = 'approved'
    ), 0) AS total_paid_cents,
    (
      SELECT MAX(pay.created_at)
      FROM public.payments pay
      WHERE pay.user_id = p.id AND pay.status = 'approved'
    ) AS last_payment_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN public.reseller_tree t ON t.user_id = p.id
  LEFT JOIN public.reseller_wallet w ON w.reseller_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;
