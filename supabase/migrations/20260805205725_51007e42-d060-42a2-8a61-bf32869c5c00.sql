CREATE OR REPLACE FUNCTION public.get_admin_resellers_v2()
RETURNS TABLE(
    id uuid,
    email text,
    full_name text,
    created_at timestamp with time zone,
    credits integer,
    parent_id uuid,
    owner_id uuid,
    sub_reseller_count bigint,
    client_count bigint,
    last_activity_at timestamp with time zone
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
    p.created_at,
    COALESCE(w.credits, 0) AS credits,
    t.parent_reseller_id AS parent_id,
    t.owner_id,
    (SELECT count(*) FROM public.reseller_tree st JOIN public.profiles sp ON st.user_id = sp.id WHERE st.parent_reseller_id = p.id AND sp.is_reseller = true) AS sub_reseller_count,
    (SELECT count(*) FROM public.reseller_tree st JOIN public.profiles sp ON st.user_id = sp.id WHERE st.parent_reseller_id = p.id AND sp.is_reseller = false) AS client_count,
    (SELECT max(created_at) FROM public.credit_history WHERE user_id = p.id) AS last_activity_at
  FROM public.profiles p
  LEFT JOIN public.reseller_tree t ON t.user_id = p.id
  LEFT JOIN public.reseller_wallet w ON w.reseller_id = p.id
  WHERE p.is_reseller = true
  ORDER BY p.created_at DESC;
END;
$$;
