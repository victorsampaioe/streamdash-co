CREATE OR REPLACE FUNCTION public.api_consume_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_window_start timestamptz,
  p_limit integer
)
RETURNS TABLE(hits integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO public.api_rate_limits(bucket, key_hash, window_start, hits)
  VALUES (p_bucket, p_key_hash, p_window_start, 1)
  ON CONFLICT (bucket, key_hash, window_start)
  DO UPDATE SET hits = public.api_rate_limits.hits + 1
  RETURNING public.api_rate_limits.hits INTO v_hits;
  RETURN QUERY SELECT v_hits, v_hits <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.api_consume_rate_limit(text,text,timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_consume_rate_limit(text,text,timestamptz,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.api_monthly_usage(p_account_id uuid, p_environment text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(sum(request_count), 0)::bigint
  FROM public.api_usage_daily
  WHERE account_id = p_account_id
    AND environment = p_environment
    AND usage_date >= date_trunc('month', now())::date;
$$;
REVOKE ALL ON FUNCTION public.api_monthly_usage(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_monthly_usage(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.api_get_or_create_resource_id(
  p_account_id uuid,
  p_resource_type text,
  p_internal_id uuid,
  p_public_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_public_id text;
BEGIN
  IF p_resource_type NOT IN ('server','incident') THEN RAISE EXCEPTION 'invalid resource type'; END IF;
  INSERT INTO public.api_resource_ids(account_id, resource_type, internal_id, public_id)
  VALUES (p_account_id, p_resource_type, p_internal_id, p_public_id)
  ON CONFLICT (account_id, resource_type, internal_id) DO NOTHING;
  SELECT public_id INTO v_public_id FROM public.api_resource_ids
   WHERE account_id=p_account_id AND resource_type=p_resource_type AND internal_id=p_internal_id;
  RETURN v_public_id;
END;
$$;
REVOKE ALL ON FUNCTION public.api_get_or_create_resource_id(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_get_or_create_resource_id(uuid,text,uuid,text) TO service_role;