-- Function to list all resellers with their stats for admin
CREATE OR REPLACE FUNCTION public.get_admin_resellers()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  credits int,
  sub_reseller_count int,
  client_count int,
  last_activity_at timestamptz
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
    p.credits,
    (SELECT COUNT(*)::int FROM public.profiles p2 WHERE p2.parent_id = p.id AND p2.is_reseller = true) AS sub_reseller_count,
    (SELECT COUNT(*)::int FROM public.profiles p2 WHERE p2.parent_id = p.id AND p2.is_reseller = false) AS client_count,
    COALESCE(
      (SELECT MAX(pa.paid_at) FROM public.payments pa WHERE pa.user_id = p.id),
      p.created_at
    ) AS last_activity_at
  FROM public.profiles p
  WHERE p.is_reseller = true
  ORDER BY p.created_at DESC;
END;
$$;

-- Function for admin to add credits manually
CREATE OR REPLACE FUNCTION public.admin_add_credits(
  _user_id uuid,
  _amount int,
  _description text DEFAULT 'Créditos adicionados pelo administrador'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Update user profile
  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + _amount
  WHERE id = _user_id;

  -- Insert into history
  INSERT INTO public.credit_history (user_id, amount, type, description)
  VALUES (_user_id, _amount, 'purchase', _description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_resellers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, int, text) TO authenticated;
